# Images in Azure Container Registry, apps on Azure Container Apps, logs in Log Analytics.
#
# Routing differs from AWS: there is no load balancer splitting paths. The web app is the only
# public endpoint and proxies /api/v1/* to the API over the environment's internal network, so the
# web image must be built with API_ORIGIN=http://<api app name> (see the api_origin output).

resource "azurerm_log_analytics_workspace" "main" {
  name                = "log-${local.name}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "PerGB2018"
  retention_in_days   = var.log_retention_days
  tags                = local.tags
}

resource "azurerm_container_registry" "main" {
  name                          = "crwg${var.environment}${random_string.suffix.result}"
  location                      = azurerm_resource_group.main.location
  resource_group_name           = azurerm_resource_group.main.name
  sku                           = "Basic"
  admin_enabled                 = false
  public_network_access_enabled = true
  tags                          = local.tags
}

resource "azurerm_role_assignment" "apps_pull_images" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.apps.principal_id
}

resource "azurerm_container_app_environment" "main" {
  name                       = "cae-${local.name}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  infrastructure_subnet_id   = azurerm_subnet.apps.id

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }

  tags = local.tags
}

locals {
  registry = azurerm_container_registry.main.login_server
  api_name = "ca-${local.name}-api"
  # The browser origin: the web app's generated hostname (a custom domain can be bound later).
  origin = "https://ca-${local.name}-web.${azurerm_container_app_environment.main.default_domain}"
}

resource "azurerm_container_app" "api" {
  name                         = local.api_name
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.apps.id]
  }

  registry {
    server   = local.registry
    identity = azurerm_user_assigned_identity.apps.id
  }

  secret {
    name                = "database-url"
    key_vault_secret_id = azurerm_key_vault_secret.database_url.versionless_id
    identity            = azurerm_user_assigned_identity.apps.id
  }

  # Internal only: reachable from the web app, never from the internet.
  ingress {
    external_enabled = false
    target_port      = 3001
    transport        = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    # A single replica: rate-limit counters are in memory (docs/known-limitations.md).
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "api"
      image  = "${local.registry}/wageguard-api:${var.image_tag}"
      cpu    = var.api_cpu
      memory = var.api_memory

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "COOKIE_SECURE"
        value = "true"
      }
      env {
        name  = "ALLOWED_ORIGINS"
        value = local.origin
      }
      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }

      liveness_probe {
        transport = "HTTP"
        port      = 3001
        path      = "/api/v1/health"
      }

      readiness_probe {
        transport = "HTTP"
        port      = 3001
        path      = "/api/v1/ready"
      }
    }
  }

  tags = local.tags

  depends_on = [azurerm_role_assignment.apps_read_secrets, azurerm_role_assignment.apps_pull_images]
}

resource "azurerm_container_app" "web" {
  name                         = "ca-${local.name}-web"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.apps.id]
  }

  registry {
    server   = local.registry
    identity = azurerm_user_assigned_identity.apps.id
  }

  ingress {
    external_enabled           = true
    target_port                = 3000
    transport                  = "http"
    allow_insecure_connections = false

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = var.web_max_replicas

    http_scale_rule {
      name                = "concurrent-requests"
      concurrent_requests = "50"
    }

    container {
      name   = "web"
      image  = "${local.registry}/wageguard-web:${var.image_tag}"
      cpu    = var.web_cpu
      memory = var.web_memory

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      liveness_probe {
        transport = "HTTP"
        port      = 3000
        path      = "/"
      }
    }
  }

  tags = local.tags

  depends_on = [azurerm_role_assignment.apps_pull_images]
}

# One-off migration job, started by hand before each release (docs/infrastructure.md). It is never
# part of an app, so a failed migration can't take a running revision down with it.
resource "azurerm_container_app_job" "migrate" {
  name                         = "caj-${local.name}-migrate"
  location                     = azurerm_resource_group.main.location
  resource_group_name          = azurerm_resource_group.main.name
  container_app_environment_id = azurerm_container_app_environment.main.id
  workload_profile_name        = "Consumption"
  replica_timeout_in_seconds   = 600
  replica_retry_limit          = 0

  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.apps.id]
  }

  registry {
    server   = local.registry
    identity = azurerm_user_assigned_identity.apps.id
  }

  secret {
    name                = "migrate-database-url"
    key_vault_secret_id = azurerm_key_vault_secret.migrate_database_url.versionless_id
    identity            = azurerm_user_assigned_identity.apps.id
  }

  template {
    container {
      name   = "migrate"
      image  = "${local.registry}/wageguard-migrate:${var.image_tag}"
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name        = "DATABASE_URL"
        secret_name = "migrate-database-url"
      }
    }
  }

  tags = local.tags

  depends_on = [azurerm_role_assignment.apps_read_secrets, azurerm_role_assignment.apps_pull_images]
}
