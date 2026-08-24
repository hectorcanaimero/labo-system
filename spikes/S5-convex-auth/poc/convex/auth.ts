import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

const DummyEmail = {
  id: "email",
  type: "email",
  from: "test@example.com",
  server: {},
  maxAge: 60 * 60,
  async sendVerificationRequest({ identifier, url, token }: any) {
    console.log(`Sending reset email to ${identifier} with token ${token} and url ${url}`);
  },
  options: {}
} as any;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({
    profile(params) {
      return { email: params.email as string };
    },
    reset: DummyEmail
  })],
  session: {
    totalDurationMs: 8 * 60 * 60 * 1000, 
    inactiveDurationMs: 8 * 60 * 60 * 1000,
  },
  signIn: {
    maxFailedAttempsPerHour: 20,
  },
  callbacks: {
    async beforeSessionCreation(ctx, { userId }) {
      console.log("LOGIN AUDIT", userId);
    },
    async afterUserCreatedOrUpdated(ctx, args) {
      console.log("USER CREATED", args.userId);
    }
  }
});
