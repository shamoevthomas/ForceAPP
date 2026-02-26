-- Function: delete_user_account()
-- Supprime TOUTES les données liées à l'utilisateur courant :
--   - fichiers storage (bucket avatars)
--   - workout_sets, workout_logs
--   - exercises, program_days, programs
--   - profil (users)
--   - compte auth (auth.users)
--
-- À exécuter dans le SQL Editor de Supabase avant de déployer la mise à jour de l'app.

CREATE OR REPLACE FUNCTION delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Supprimer les fichiers storage (avatars)
  DELETE FROM storage.objects
  WHERE bucket_id = 'avatars'
    AND name LIKE (v_user_id::text || '/%');

  -- 2. Supprimer les sets d'entraînement
  DELETE FROM workout_sets
  WHERE workout_log_id IN (
    SELECT id FROM workout_logs WHERE user_id = v_user_id
  );

  -- 3. Supprimer les logs d'entraînement
  DELETE FROM workout_logs WHERE user_id = v_user_id;

  -- 4. Supprimer les exercices des programmes
  DELETE FROM exercises
  WHERE program_day_id IN (
    SELECT pd.id
    FROM program_days pd
    JOIN programs p ON p.id = pd.program_id
    WHERE p.user_id = v_user_id
  );

  -- 5. Supprimer les jours de programme
  DELETE FROM program_days
  WHERE program_id IN (
    SELECT id FROM programs WHERE user_id = v_user_id
  );

  -- 6. Supprimer les programmes
  DELETE FROM programs WHERE user_id = v_user_id;

  -- 7. Supprimer le profil utilisateur
  DELETE FROM users WHERE id = v_user_id;

  -- 8. Supprimer le compte auth (irréversible)
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

-- Sécurité : seuls les utilisateurs authentifiés peuvent appeler cette fonction
REVOKE ALL ON FUNCTION delete_user_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_user_account() TO authenticated;
