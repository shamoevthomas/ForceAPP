export const DARK_COLORS = {
    primary: '#6C63FF',
    primaryLight: '#8B83FF',
    primaryDark: '#4A42D4',
    accent: '#FF6B6B',
    accentLight: '#FF8E8E',
    background: '#0A0A1A',
    backgroundLight: '#12122A',
    card: '#1A1A3E',
    cardLight: '#22224A',
    text: '#FFFFFF',
    textSecondary: '#A0A0C0',
    textMuted: '#606080',
    success: '#4ADE80',
    successLight: '#86EFAC',
    warning: '#FBBF24',
    warningLight: '#FDE68A',
    error: '#EF4444',
    errorLight: '#F87171',
    info: '#60A5FA',
    infoLight: '#93C5FD',
    gradeGringalet: '#9CA3AF',
    gradeCrevette: '#F97316',
    gradeCostaud: '#3B82F6',
    gradeGuerrier: '#8B5CF6',
    gradeMachine: '#EF4444',
    gradeTitan: '#F59E0B',
    gradeHulk: '#22C55E',
    border: '#2A2A5A',
    overlay: 'rgba(0,0,0,0.7)',
    gradient1: '#6C63FF',
    gradient2: '#FF6B6B',
};

export const LIGHT_COLORS = {
    primary: '#4A42D4',
    primaryLight: '#6C63FF',
    primaryDark: '#352EAB',
    accent: '#FF5252',
    accentLight: '#FF8686',
    background: '#F8F9FA',
    backgroundLight: '#FFFFFF',
    card: '#FFFFFF',
    cardLight: '#F1F3F5',
    text: '#1A1A1A',
    textSecondary: '#495057',
    textMuted: '#868E96',
    success: '#2FB344',
    successLight: '#8ED197',
    warning: '#F59F00',
    warningLight: '#FFD480',
    error: '#D63939',
    errorLight: '#EC8E8E',
    info: '#4299E1',
    infoLight: '#8DC2EB',
    gradeGringalet: '#ADB5BD',
    gradeCrevette: '#FD7E14',
    gradeCostaud: '#1C7ED6',
    gradeGuerrier: '#7048E8',
    gradeMachine: '#E03131',
    gradeTitan: '#F08C00',
    gradeHulk: '#37B24D',
    border: '#DEE2E6',
    overlay: 'rgba(0,0,0,0.3)',
    gradient1: '#4A42D4',
    gradient2: '#FF5252',
};

// Legacy support
export const COLORS = DARK_COLORS;

export const FONTS = {
    regular: 'System',
    medium: 'System',
    bold: 'System',
};

export const SPACING = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

export const BORDER_RADIUS = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
};

export const GRADE_COLORS: Record<string, string> = {
    'Gringalet': DARK_COLORS.gradeGringalet,
    'Crevette': DARK_COLORS.gradeCrevette,
    'Costaud': DARK_COLORS.gradeCostaud,
    'Guerrier': DARK_COLORS.gradeGuerrier,
    'Machine': DARK_COLORS.gradeMachine,
    'Titan': DARK_COLORS.gradeTitan,
    'Hulk': DARK_COLORS.gradeHulk,
};

export const GRADE_EMOJIS: Record<string, string> = {
    'Gringalet': '🐣',
    'Crevette': '🦐',
    'Costaud': '💪',
    'Guerrier': '⚔️',
    'Machine': '🤖',
    'Titan': '🏛️',
    'Hulk': '💚',
};
