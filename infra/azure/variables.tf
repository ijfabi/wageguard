variable "subscription_id" {
  description = "Azure subscription to deploy into."
  type        = string
}

variable "location" {
  description = "Azure region."
  type        = string
  default     = "australiaeast"
}

variable "environment" {
  description = "Name used in resource names and tags."
  type        = string
  default     = "demo"
}

variable "image_tag" {
  description = "Tag of the api, migrate and web images pushed to the container registry."
  type        = string
}

variable "api_cpu" {
  description = "vCPU for the API container (Consumption profile: 0.25 to 4, paired with memory)."
  type        = number
  default     = 0.5
}

variable "api_memory" {
  description = "Memory for the API container, e.g. 1Gi (must be 2Gi per vCPU on Consumption)."
  type        = string
  default     = "1Gi"
}

variable "web_cpu" {
  description = "vCPU for the web container."
  type        = number
  default     = 0.25
}

variable "web_memory" {
  description = "Memory for the web container."
  type        = string
  default     = "0.5Gi"
}

variable "web_max_replicas" {
  description = "Upper bound for the web app. It holds no state, so it can scale out."
  type        = number
  default     = 3
}

variable "db_sku" {
  description = "PostgreSQL Flexible Server SKU."
  type        = string
  default     = "B_Standard_B1ms"
}

variable "db_backup_retention_days" {
  description = "Days of automated backups (point-in-time recovery window, 7 to 35)."
  type        = number
  default     = 7
}

variable "log_retention_days" {
  description = "Log Analytics retention (30 days minimum on the pay-as-you-go tier)."
  type        = number
  default     = 30
}
