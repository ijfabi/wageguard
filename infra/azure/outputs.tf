output "url" {
  description = "Public address of the web app."
  value       = local.origin
}

output "registry" {
  description = "Push the api, migrate and web images here, tagged with image_tag."
  value       = azurerm_container_registry.main.login_server
}

output "api_origin" {
  description = "Build the web image with --build-arg API_ORIGIN=<this> so it proxies to the internal API."
  value       = "http://${local.api_name}"
}

output "migrate_job" {
  description = "Run before each release: az containerapp job start -g <resource_group> -n <this>."
  value       = azurerm_container_app_job.migrate.name
}

output "resource_group" {
  description = "Everything this configuration creates lives in this resource group."
  value       = azurerm_resource_group.main.name
}

output "database_host" {
  description = "Private hostname of the PostgreSQL server (resolvable only inside the virtual network)."
  value       = azurerm_postgresql_flexible_server.main.fqdn
}
