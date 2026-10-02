export type AuthActionState = {
  error?: string;
  success?: boolean;
  email?: string;
};

export const initialAuthState: AuthActionState = {};
