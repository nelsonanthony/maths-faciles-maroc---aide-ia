

export interface Exercise {
    id: string;
    statement: string;
    correctionSnippet: string;
    fullCorrection?: string;
    imageUrl?: string;
    latexFormula?: string;
}

export type NewExercise = Omit<Exercise, 'id'>;

export interface Series {
    id: string;
    title: string;
    exercises: Exercise[];
}

export interface QuizQuestion {
    id:string;
    question: string;
    options?: string[];
    correctAnswerIndex?: number;
}

export type NewQuizQuestion = Omit<QuizQuestion, 'id'>;

export interface Quiz {
    id: string;
    title: string;
    questions: QuizQuestion[];
}

export type NewQuiz = Pick<Quiz, 'title'>;

export interface VideoLink {
    id: string;
    title: string;
}

export interface Chapter {
    id: string;
    title: string;
    summary: string;
    videoLinks?: VideoLink[];
    quizzes: Quiz[];
    series: Series[];
}

export type NewChapter = Pick<Chapter, 'title'>;

export interface Level {
    id: string;
    levelName: string;
    description: string;
    chapters: Chapter[];
}

export type NewLevel = Pick<Level, 'levelName' | 'description'>;

export interface Badge {
    id: string;
    name: string;
    icon: string; // Could be a name of an icon component or a URL
    description: string;
}

export interface User {
    id: string;
    email: string;
    is_admin: boolean;
    xp: number;
    level: number;
    completed_exercises: string[]; // List of completed exercise IDs
    quiz_attempts: UserQuizAttempt[]; // List of quiz attempts
}

export interface Profile extends Omit<User, 'is_admin' | 'completed_exercises' | 'quiz_attempts'> {}

export interface AuthContextType {
    user: User | null;
    isAdmin: boolean;
    isLoading: boolean;
    updateUser: (data: Partial<User>) => void;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string) => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    logout: () => void;
    requestPasswordReset: (email: string) => Promise<string>;
    resetPassword: (newPassword: string) => Promise<void>;
    adminEmailForDebug?: string;
}

// Types for AI and Embeddings
export interface VideoChunk {
    id: string;
    chapter_id: string;
    video_id: string;
    chunk_text: string;
    start_time_seconds: number;
    similarity: number;
}

export interface DialogueMessage {
    role: 'ai' | 'user' | 'system';
    content: string;
}

export interface SocraticStep {
    ia_question: string;
    student_response_prompt: string;
    expected_answer_keywords: string[];
    positive_feedback: string;
    hint_for_wrong_answer: string;
}

export type SocraticPath = SocraticStep[];


export interface AIResponse {
    explanation?: string;
    socraticPath?: SocraticPath;
    videoChunk?: VideoChunk;
}

// Types for Chat
export interface ChatRoom {
    id: string;
    created_at: string;
    exercise_id: string;
    name: string;
    created_by: string;
}

export interface ChatMessage {
    id: number;
    created_at: string;
    room_id: string;
    user_id: string;
    user_email: string;
    content: string;
}

// Types for Handwritten Correction
export interface HandwrittenCorrectionLine {
    line: number;
    student_text: string;
    status: 'correct' | 'error';
    explanation?: string;
}

export interface HandwrittenCorrectionResponse {
    score: number;
    lines: HandwrittenCorrectionLine[];
    global_feedback: string;
}

export type ExerciseContext = {
    levelId: string;
    chapterId: string;
    seriesId: string;
    exerciseId: string;
};

// Type for Deletion Info
export interface DeletionInfo {
    type: 'level' | 'chapter' | 'series' | 'exercise' | 'quiz' | 'quizQuestion';
    ids: { levelId: string; chapterId?: string; seriesId?: string; exerciseId?: string; quizId?: string; questionId?: string; };
    name: string;
}

// Unified Modal State
export type ModalState =
  | { type: 'editLevel'; payload: { level: Level | null } }
  | { type: 'addLevel' }
  | { type: 'editChapter'; payload: { chapter: Chapter | null } }
  | { type: 'addChapter' }
  | { type: 'editSeries'; payload: { series: Series | null; chapterId: string } }
  | { type: 'editExercise'; payload: { exercise: Exercise | null; seriesId: string } }
  | { type: 'editQuiz'; payload: { quiz: Quiz | null; chapterId: string } }
  | { type: 'editQuizQuestion'; payload: { question: QuizQuestion | null; quizId: string; chapterId: string } }
  | { type: 'delete'; payload: DeletionInfo };

export type View = 'home' | 'courses' | 'chapters' | 'chapterHome' | 'seriesList' | 'exerciseList' | 'exercise' | 'quiz' | 'login' | 'register' | 'dashboard' | 'forgotPassword' | 'resetPassword' | 'chat';

// Type for User Progress
export interface UserQuizAttempt {
    id: number;
    user_id: string;
    quiz_id: string;
    score: number;
    total_questions: number;
    taken_at: string;
    chapter_id: string; // This field is now mandatory for aggregation
}

// Type for Math Keyboard
export interface MathKey {
    display: string; // What's shown on the button (can be LaTeX)
    type: 'cmd' | 'write' | 'keystroke';
    value: string; // The command, text, or keystroke name
    width?: number; // Column span
    category?: 'main' | 'func' | 'action' | 'spacer';
}

export type MathKeyboardLayout = {
  [name: string]: {
    cols: number;
    keys: MathKey[][];
  };
};