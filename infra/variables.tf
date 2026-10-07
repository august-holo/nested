variable "name" {
  description = "Prefix for resource names"
  type        = string
  default     = "nested"
}

variable "zone_name" {
  description = "Existing Route 53 hosted zone"
  type        = string
  default     = "holotekt.com"
}

variable "domain_name" {
  description = "Hostname the app is served from"
  type        = string
  default     = "nested.holotekt.com"
}

variable "github_repo" {
  description = "owner/name of the repository allowed to deploy"
  type        = string
  default     = "august-holo/nested"
}

variable "github_branch" {
  description = "Branch allowed to deploy"
  type        = string
  default     = "main"
}

variable "instance_type" {
  type    = string
  default = "t4g.nano"
}

variable "api_port" {
  type    = number
  default = 8080
}
