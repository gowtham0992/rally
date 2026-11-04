DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM studio_questions) OR EXISTS(SELECT 1 FROM studio_question_drafts) THEN
  RAISE EXCEPTION 'Cannot remove populated studio question history' USING ERRCODE='23514';
 END IF;
END;$$;
DROP FUNCTION purge_expired_private_text(integer);
ALTER FUNCTION purge_expired_pre_question_text(integer) RENAME TO purge_expired_private_text;
DROP FUNCTION purge_expired_studio_questions(integer);
DROP TABLE studio_questions;
DROP FUNCTION protect_studio_question();
DROP TABLE studio_question_drafts;
DROP FUNCTION protect_studio_question_draft();
