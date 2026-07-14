# Administrator Manual

For Restaurant or Hybrid deployments, configure business mode and feature flags in Settings, assign restaurant permissions by role, and use [Restaurant Operations](RESTAURANT_OPERATIONS.md) for table and order administration.

Administrators manage business profile settings, stores, warehouses, users, roles, permissions, taxes, receipt settings, backups, and audit review.

Security-sensitive actions are recorded in the audit log.

## Business Mode

Open Settings and choose Retail, Restaurant, or Hybrid under Business Mode. Retail keeps restaurant controls hidden. Restaurant and Hybrid expose restaurant configuration in Settings.

## Product Availability

When creating or editing a product in Inventory, choose Retail, Restaurant, or Retail and Restaurant under Product Channel. Existing products remain Retail products until changed.

## Import Defaults

Settings includes import batch size, duplicate-file protection, and the default import mode.

Open Inventory and use Advanced Inventory Import to upload Excel or CSV, paste rows from Excel or Google Sheets, or enter rows in the manual grid. Review detected column mappings, select a warehouse and mode, then choose Preview Import.

Resolve invalid rows before confirmation. Product-name-only matches stay in manual review unless an explicit duplicate action is selected. Download the error report when corrections need to be made in the original workbook.

Import History shows the operator, source, result counts, and status. Details and CSV reports remain available after import. Rollback is available only while no later product, sale, purchase, refund, or stock activity depends on the imported state.
