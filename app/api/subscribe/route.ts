import { NextResponse } from "next/server";
import { MongoServerError } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { normalizeEmail, validateEmail } from "@/lib/validations";
import { EmailSubscriber } from "@/models/EmailSubscriber";
import type { SubscribeResponse } from "@/types";

export const runtime = "nodejs";

function json(body: SubscribeResponse, status: number) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return json(
      {
        success: false,
        message: "Please send a valid request.",
        code: "invalid_email",
      },
      400,
    );
  }

  const email = normalizeEmail(
    typeof payload === "object" && payload !== null && "email" in payload
      ? payload.email
      : "",
  );
  const validationError = validateEmail(email);

  if (validationError) {
    return json(
      {
        success: false,
        message: validationError,
        code: "invalid_email",
      },
      400,
    );
  }

  try {
    await connectToDatabase();
    await EmailSubscriber.create({ email, source: "waitlist" });

    return json(
      {
        success: true,
        message: "You're on the list. We'll be in touch before launch.",
      },
      201,
    );
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return json(
        {
          success: true,
          alreadySubscribed: true,
          message: "You're already on the waitlist.",
        },
        200,
      );
    }

    if (error instanceof Error && error.message.includes("MONGODB_URI")) {
      return json(
        {
          success: false,
          message: "Waitlist signup is temporarily unavailable.",
          code: "config_error",
        },
        503,
      );
    }

    console.error("Failed to save waitlist subscriber", error);

    return json(
      {
        success: false,
        message: "Something went wrong. Please try again in a moment.",
        code: "server_error",
      },
      500,
    );
  }
}
