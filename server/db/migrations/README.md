# Migration ledger

Migrations run in file-name order (`NNN_name.sql`). Every file must be safe to
apply once on top of the previous ones; tests apply all of them to a throwaway
database (`server/test/helpers/db.mjs`). Never edit an applied migration: add a
new one.

Numbers are reserved up front so two milestones never both write the same
number (see `docs/BUILD_PLAN.md`, conventions). Take the next free number only
after checking this table, and add your row in the same change.

| # | File | Status | Owner / purpose |
|---|---|---|---|
| 001 | `001_init.sql` | applied | Initial schema |
| 002 | `002_text_ids.sql` | applied | Text ids |
| 003 | `003_users_text.sql` | applied | Text user ids |
| 004 | `004_merchants_text.sql` | applied | Text merchant ids |
| 005 | `005_conversations.sql` | applied | Agent conversations (one per property) |
| 006 | `006_campaigns_text.sql` | applied | Text campaign ids |
| 007 | `007_verification.sql` | applied | Email verification codes |
| 008 | `008_property_palette.sql` | applied | Property palette |
| 009 | `009_usage.sql` | applied | Agent usage |
| 010 | `010_moderation.sql` | applied | Merchant suspension and audit events |
| 011 | `011_refunds.sql` | applied | Refunds |
| 012 | `012_app_url.sql` | applied | Product app URLs |
| 013 | `013_sessions.sql` | applied | Sessions |
| 014 | `014_builders.sql` | applied | Builders and offerings |
| 015 | `015_house_authority.sql` | applied | House authority and profiles |
| 016 | `016_conversations_per_user.sql` | **reserved: S3** | Conversations keyed by (property_id, user_id); old table kept |
| 017 | `017_plots.sql` | applied (reserved: B1) | Plot registry tied to Blender doors: `plots`, `properties.plot_id` UNIQUE FK, one house per merchant, owner checks on house and catalogue bindings, `builders.merchant_id` |
| 018 | `018_listing_display.sql` | applied (reserved: P1) | Listing display on `builder_offerings`: `category` (CHECK against `shared/contracts/product-categories.json` ids, NULL = generic), `display_slot` 0-31, `sort_order` ±10000, `active` (false hides from visitors) |
| 019 | `019_presence_settings.sql` | applied (reserved: C9) | Presence privacy: `presence_settings` (user_id PK FK users ON DELETE CASCADE, `hide_name`, `anonymous`, both default false = names visible, `updated_at`) |
| 020 | `020_district_plots.sql` | **reserved: B5** | District plots |

The file names for 016–020 are the planned names; the owner may refine the
suffix but must keep the number.
