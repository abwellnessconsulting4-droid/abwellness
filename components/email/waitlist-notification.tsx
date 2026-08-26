import { SITE_NAME } from "@/lib/constants";

export function WaitlistNotificationEmail({ email }: { email: string }) {
  return (
    <div
      style={{
        backgroundColor: "#001428",
        color: "#f4f7fb",
        fontFamily: "Arial, Helvetica, sans-serif",
        padding: "32px 20px",
      }}
    >
      <div style={{ maxWidth: "520px", margin: "0 auto" }}>
        <p style={{ margin: "0 0 8px", color: "#d4af37", fontSize: "12px" }}>
          {SITE_NAME}
        </p>
        <h1 style={{ margin: "0 0 16px", fontSize: "22px" }}>
          New waitlist signup
        </h1>
        <p style={{ margin: 0, fontSize: "16px", lineHeight: 1.6 }}>
          {email} just joined the waitlist.
        </p>
      </div>
    </div>
  );
}
