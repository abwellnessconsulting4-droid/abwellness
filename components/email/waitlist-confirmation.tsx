import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";

export function WaitlistConfirmationEmail() {
  return (
    <div
      style={{
        backgroundColor: "#001428",
        color: "#f4f7fb",
        fontFamily:
          'Georgia, "Times New Roman", Times, serif',
        padding: "40px 20px",
      }}
    >
      <div
        style={{
          maxWidth: "520px",
          margin: "0 auto",
          border: "1px solid #d4af3755",
          borderRadius: "16px",
          padding: "36px 28px",
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            color: "#d4af37",
            letterSpacing: "0.18em",
            fontSize: "12px",
            textTransform: "uppercase",
          }}
        >
          {SITE_NAME}
        </p>
        <h1
          style={{
            margin: "0 0 16px",
            fontSize: "28px",
            lineHeight: 1.3,
            color: "#f8f4ea",
          }}
        >
          You&apos;re on the list.
        </h1>
        <p style={{ margin: "0 0 16px", fontSize: "16px", lineHeight: 1.7 }}>
          Thank you for joining the {SITE_NAME} waitlist. We&apos;ll send a
          quiet note when consultations, programs, and resources are ready.
        </p>
        <p
          style={{
            margin: 0,
            color: "#9eb6d4",
            fontSize: "13px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {SITE_TAGLINE}
        </p>
      </div>
    </div>
  );
}
