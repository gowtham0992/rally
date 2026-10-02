DROP TABLE provider_webhooks, payment_events, command_results, payment_operations, offer_members, reservations, offers;
DELETE FROM schema_migrations WHERE version = '001_payments';
