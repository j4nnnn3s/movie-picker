import type {
  Answers,
  Feedback,
  ModeInput,
  Question,
  Service,
  Suggestion,
} from "@/lib/contracts";

export type Step = "services" | "mode" | "questions" | "suggestions";

export type PickerState = {
  step: Step;
  services: Service[];
  input: ModeInput | null;
  questions: Question[];
  questionIndex: number;
  answers: Answers;
  queue: Suggestion[];
  current: number;
  seenIds: number[];
  feedback: Feedback[];
};

export const initialState: PickerState = {
  step: "services", services: [], input: null, questions: [], questionIndex: 0,
  answers: {}, queue: [], current: 0, seenIds: [], feedback: [],
};

export type Action =
  | { type: "hydrate"; services: Service[]; seenIds: number[] }
  | { type: "setServices"; services: Service[] }
  | { type: "setInput"; input: ModeInput; questions: Question[] }
  | { type: "answer"; questionId: string; optionIds: string[] }
  | { type: "questionBack" }
  | { type: "suggestions"; suggestions: Suggestion[]; append?: boolean }
  | { type: "next"; feedback?: Feedback }
  | { type: "back" }
  | { type: "editServices" }
  | { type: "restart" };

export function pickerReducer(state: PickerState, action: Action): PickerState {
  switch (action.type) {
    case "hydrate": return { ...state, services: action.services, seenIds: action.seenIds };
    case "setServices": return { ...state, services: action.services, step: "mode" };
    case "setInput": return {
      ...state, input: action.input, questions: action.questions, questionIndex: 0,
      answers: {}, queue: [], current: 0, feedback: [], step: "questions",
    };
    case "answer": {
      const answers = { ...state.answers, [action.questionId]: action.optionIds };
      const last = state.questionIndex >= state.questions.length - 1;
      return { ...state, answers, questionIndex: last ? state.questionIndex : state.questionIndex + 1 };
    }
    case "questionBack":
      return state.questionIndex > 0 ? { ...state, questionIndex: state.questionIndex - 1 } : { ...state, step: "mode" };
    case "suggestions": return {
      ...state,
      step: "suggestions",
      queue: action.append ? [...state.queue, ...action.suggestions.filter((movie) => !state.queue.some((old) => old.tmdbId === movie.tmdbId))] : action.suggestions,
      current: action.append ? state.current : 0,
    };
    case "next": {
      const movie = state.queue[state.current];
      return {
        ...state,
        current: Math.min(state.current + 1, state.queue.length),
        seenIds: movie ? [...new Set([...state.seenIds, movie.tmdbId])].slice(-1000) : state.seenIds,
        feedback: action.feedback ? [...state.feedback, action.feedback].slice(-20) : state.feedback,
      };
    }
    case "back": return { ...state, current: Math.max(0, state.current - 1) };
    case "editServices": return { ...state, step: "services" };
    case "restart": return { ...initialState, services: state.services, seenIds: state.seenIds, step: "mode" };
  }
}
