-- Disposable empty test schemas only; never run against participant data.
DROP TABLE planning_events;
DROP TABLE intake_commands;
ALTER TABLE planning_members DROP CONSTRAINT own_current_preference;
DROP TABLE preference_revisions;
DROP TABLE planning_members;
DROP TABLE planning_groups;
