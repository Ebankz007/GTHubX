import { z } from "zod";
import { MAX_PASSWORD_BYTES } from "@/lib/password";

/** Normalise (trim + lowercase) then validate. Stored emails are always lowercase. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));

/**
 * Password policy. The max is `MAX_PASSWORD_BYTES` (72) because bcrypt silently
 * truncates beyond that — accepting a longer password would create collisions.
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(
    MAX_PASSWORD_BYTES,
    `Password must be at most ${MAX_PASSWORD_BYTES} characters`,
  )
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().trim().max(32).optional(),
  country: z.string().trim().max(64).optional(),
  referralCode: z.string().trim().max(64).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(MAX_PASSWORD_BYTES),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Missing reset token"),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Missing verification token"),
});

/**
 * Self-service profile edit. Email is deliberately absent — changing it re-runs
 * verification, which is its own flow. `phone`/`country` accept an empty string
 * so an HTML form can clear a field, and normalise it to null at the edge.
 */
export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  phone: z
    .string()
    .trim()
    .max(32, "Phone number is too long")
    .or(z.literal(""))
    .optional(),
  country: z
    .string()
    .trim()
    .max(64, "Country name is too long")
    .or(z.literal(""))
    .optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;

/* ------------------------------------------------------------- support ----- */

export const createTicketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(3, "Subject must be at least 3 characters")
    .max(160, "Subject is too long"),
  category: z.string().trim().max(40).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  body: z
    .string()
    .trim()
    .min(10, "Tell us a bit more — at least 10 characters")
    .max(4000, "Message is too long"),
});

export const createMessageSchema = z.object({
  body: z.string().trim().min(1, "Write a message").max(4000, "Message is too long"),
});

/* ------------------------------------------------------------ community ----- */

export const createPostSchema = z.object({
  title: z
    .string()
    .trim()
    .max(160, "Title is too long")
    .or(z.literal(""))
    .optional(),
  body: z
    .string()
    .trim()
    .min(2, "Write something — at least 2 characters")
    .max(4000, "Post is too long"),
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "Write a comment").max(2000, "Comment is too long"),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

/* --------------------------------------------------------------- admin ------ */

/**
 * Admin sign-in. Same shape as `loginSchema` — a different schema would only
 * exist to be maintained twice. The route decides which table to consult.
 */
export const adminLoginSchema = loginSchema;

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

/** The `AdminRole` enum, mirrored for schema validation. */
export const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "CONTENT_ADMIN",
  "SUPPORT_ADMIN",
  "FINANCE_ADMIN",
  "NETWORK_ADMIN",
  "TRADER_ADMIN",
] as const;

/**
 * Superadmin edit of an admin account: change the role, suspend/restore access,
 * or both. Rejects an empty patch rather than writing a no-op audit entry.
 */
export const updateAdminSchema = z
  .object({
    role: z.enum(ADMIN_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.isActive !== undefined, {
    message: "Nothing to update",
  });

export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;

/** First human-readable message from a Zod error. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}
