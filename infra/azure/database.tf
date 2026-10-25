# PostgreSQL 17 Flexible Server: private (VNet-injected), encrypted at rest by the platform, backed
# up daily with point-in-time recovery, and locked against accidental deletion. Burstable and
# single-zone to keep a demo cheap; see docs/runbooks/backup-and-recovery.md.

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "azurerm_postgresql_flexible_server" "main" {
  name                = "psql-${local.name}-${random_string.suffix.result}"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  version             = "17"
  sku_name            = var.db_sku
  storage_mb          = 32768
  auto_grow_enabled   = true

  administrator_login    = "wageguard"
  administrator_password = random_password.db.result

  delegated_subnet_id           = azurerm_subnet.database.id
  private_dns_zone_id           = azurerm_private_dns_zone.database.id
  public_network_access_enabled = false

  backup_retention_days        = var.db_backup_retention_days
  geo_redundant_backup_enabled = false

  maintenance_window {
    day_of_week  = 0  # Sunday
    start_hour   = 16 # 02:00-03:00 AEST
    start_minute = 0
  }

  tags = local.tags

  depends_on = [azurerm_private_dns_zone_virtual_network_link.database]

  lifecycle {
    # Azure picks the zone when none is given; don't fight it on later plans.
    ignore_changes = [zone]
  }
}

resource "azurerm_postgresql_flexible_server_database" "wageguard" {
  name      = "wageguard"
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# TLS is mandatory on Flexible Server (require_secure_transport is on by default); pin it anyway so
# a portal change shows up as drift.
resource "azurerm_postgresql_flexible_server_configuration" "secure_transport" {
  name      = "require_secure_transport"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "on"
}

resource "azurerm_management_lock" "database" {
  name       = "do-not-delete"
  scope      = azurerm_postgresql_flexible_server.main.id
  lock_level = "CanNotDelete"
  notes      = "Holds every saved audit. Remove deliberately, after a backup, if the demo is torn down."
}

# The server certificate chains to a public root (DigiCert Global Root G2), which is already in the
# images' trust store, so no bundle is needed here. As on AWS, the runtime and the migration engine
# spell their TLS options differently.
locals {
  database_base = "postgresql://${azurerm_postgresql_flexible_server.main.administrator_login}:${random_password.db.result}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/${azurerm_postgresql_flexible_server_database.wageguard.name}"
}
