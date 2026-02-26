-- Fonction reset_user_data
-- Supprime toutes les données d'entraînement et programmes de l'utilisateur
-- CONSERVE : profil onboarding (username, age, height_cm, birth_date, current_weight_kg,
--            experience_level, gender), photo de profil (avatar_url)
-- NE SUPPRIME PAS : le compte auth, le fichier avatar dans le storage

CREATE OR REPLACE FUNCTION reset_user_data()
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

  -- 1. Supprimer les sets d'entraînement
  DELETE FROM workout_sets
  WHERE workout_log_id IN (
    SELECT id FROM workout_logs WHERE user_id = v_user_id
  );

  -- 2. Supprimer les logs d'entraînement
  DELETE FROM workout_logs WHERE user_id = v_user_id;

  -- 3. Supprimer les exercices des programmes
  DELETE FROM exercises
  WHERE program_day_id IN (
    SELECT pd.id
    FROM program_days pd
    JOIN programs p ON p.id = pd.program_id
    WHERE p.user_id = v_user_id
  );

  -- 4. Supprimer les jours de programme
  DELETE FROM program_days
  WHERE program_id IN (
    SELECT id FROM programs WHERE user_id = v_user_id
  );

  -- 5. Supprimer les programmes
  DELETE FROM programs WHERE user_id = v_user_id;

  -- 6. Réinitialiser les stats calculées (grade & streak) sans toucher aux données onboarding ni à l'avatar
  UPDATE users
  SET
    force_grade  = 'E',
    streak_days  = 0,
    updated_at   = now()
  WHERE id = v_user_id;

END;
$$;

REVOKE ALL ON FUNCTION reset_user_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reset_user_data() TO authenticated;
