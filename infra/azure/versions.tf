# Optional Azure demo deployment, the counterpart of infra/aws. Written and validated, never applied:
# applying it creates billable resources and must only happen with explicit approval.
# See docs/infrastructure.md.

terraform {
  required_version = ">= 1.16.5, < 2.0.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "5.9.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "3.7.2"
    }
  }

  # Keep state somewhere encrypted and access-controlled (for example an Azure Storage container
  # with versioning and soft delete): it contains the generated database password.
  # backend "azurerm" {}
}

provider "azurerm" {
  subscription_id = var.subscription_id

  features {
    key_vault {
      # Never purge a vault or its secrets as a side effect of destroy.
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
    resource_group {
      prevent_deletion_if_contains_resources = true
    }
  }
}

locals {
  name = "wageguard-${var.environment}"

  tags = {
    Project     = "wageguard"
    Environment = var.environment
    ManagedBy   = "terraform"
    Data        = "synthetic-only"
  }
}

data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "main" {
  name     = "rg-${local.name}"
  location = var.location
  tags     = local.tags
}
