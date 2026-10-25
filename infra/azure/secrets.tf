# Connection strings live in Key Vault and are read by the containers through a managed identity at
# start-up. They never appear in container definitions, images or logs.

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

resource "azurerm_user_assigned_identity" "apps" {
  name                = "id-${local.name}-apps"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = local.tags
}

resource "azurerm_key_vault" "main" {
  name                = "kv-wg-${var.environment}-${random_string.suffix.result}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  rbac_authorization_enabled = true
  purge_protection_enabled   = true
  soft_delete_retention_days = 7

  tags = local.tags
}

# Whoever runs Terraform writes the secrets; the apps can only read them.
resource "azurerm_role_assignment" "deployer_writes_secrets" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_role_assignment" "apps_read_secrets" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.apps.principal_id
}

resource "azurerm_key_vault_secret" "database_url" {
  name         = "database-url"
  key_vault_id = azurerm_key_vault.main.id
  value        = "${local.database_base}?sslmode=verify-full"
  content_type = "text/plain"

  depends_on = [azurerm_role_assignment.deployer_writes_secrets]
}

resource "azurerm_key_vault_secret" "migrate_database_url" {
  name         = "migrate-database-url"
  key_vault_id = azurerm_key_vault.main.id
  value        = "${local.database_base}?sslmode=require&sslaccept=strict"
  content_type = "text/plain"

  depends_on = [azurerm_role_assignment.deployer_writes_secrets]
}

# Encrypts two-factor secrets at rest. Generated once and kept in state: replacing it would make
# every enrolled authenticator stop working, so it must never be rotated without re-enrolment.
resource "random_bytes" "totp_encryption_key" {
  length = 32
}

resource "azurerm_key_vault_secret" "totp_encryption_key" {
  name         = "totp-encryption-key"
  key_vault_id = azurerm_key_vault.main.id
  value        = random_bytes.totp_encryption_key.base64
  content_type = "text/plain"

  depends_on = [azurerm_role_assignment.deployer_writes_secrets]
}

# SMTP relay URL with its credentials. A container app can only reference a secret that exists, so
# Terraform writes an invalid placeholder and then leaves the value alone: set the real one with
# `az keyvault secret set` (docs/deployment.md). Until then the API runs but cannot send email.
resource "azurerm_key_vault_secret" "smtp_url" {
  name         = "smtp-url"
  key_vault_id = azurerm_key_vault.main.id
  value        = "smtp://replace-me.invalid:587"
  content_type = "text/plain"

  lifecycle {
    ignore_changes = [value]
  }

  depends_on = [azurerm_role_assignment.deployer_writes_secrets]
}
