import { UserRole } from "../types/enums";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        name: string;
        email: string;
      };
    }
  }
}

export {};
