export type ExperienceLevel = 'beginner' | 'novice' | 'experienced';
export type Gender = 'male' | 'female';

export type WeightIncrement = '1.25' | '2.5' | '3.75' | '5' | '6.25' | '7.5' | '8.75' | '10';

export interface UserProfile {
    id: string;
    username: string;
    age: number | null;
    height_cm: number | null;
    experience_level: ExperienceLevel | null;
    gender: Gender | null;
    current_weight_kg: number | null;
    avatar_url: string | null;
    birth_date: string | null;
    force_grade: string;
    streak_days: number;
    created_at: string;
    updated_at: string;
}

export interface Program {
    id: string;
    user_id: string;
    name: string;
    is_active: boolean;
    created_at: string;
}

export interface ProgramDay {
    id: string;
    program_id: string;
    day_number: number;
    day_label: string | null;
}

export interface Exercise {
    id: string;
    program_day_id: string;
    name: string;
    target_sets: number;
    target_reps: number;
    current_weight_kg: number;
    weight_increment: WeightIncrement;
    sort_order: number;
}

export interface WorkoutLog {
    id: string;
    user_id: string;
    program_day_id: string;
    workout_date: string;
    completed: boolean;
    created_at: string;
}

export interface WorkoutSet {
    id: string;
    workout_log_id: string;
    exercise_id: string;
    set_number: number;
    weight_kg: number | null;
    reps: number | null;
    is_amrap: boolean;
    notes: string | null;
}

// Extended types with relations
export interface ProgramDayWithExercises extends ProgramDay {
    exercises: Exercise[];
}

export interface ProgramWithDays extends Program {
    program_days: ProgramDayWithExercises[];
}

export interface WorkoutSetWithExercise extends WorkoutSet {
    exercise: Exercise;
}

export interface WorkoutLogWithSets extends WorkoutLog {
    workout_sets: WorkoutSetWithExercise[];
    program_day: ProgramDayWithExercises;
}
