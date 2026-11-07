import {
  ArrowUpRight,
  Camera,
  ClipboardCheck,
  ShieldCheck,
} from "lucide-react";
import { LoginForm } from "@/components/tara/login-form";
import { Wordmark } from "@/components/tara/ui";
export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-story">
        <Wordmark />
        <div className="login-story-copy">
          <p className="eyebrow">YOUR FIELD ASSISTANT</p>
          <h1>
            A little guidance.
            <br />A clearer view.
          </h1>
          <p>
            Stay inside the procedure. Keep the evidence.
            <br />
            Let good work speak for itself.
          </p>
          <div className="login-features">
            <span>
              <ClipboardCheck />
              SOP grounded
            </span>
            <span>
              <Camera />
              Evidence backed
            </span>
            <span>
              <ShieldCheck />
              Quiet by default
            </span>
          </div>
        </div>
        <span className="login-footnote">
          Your work, in focus.
          <ArrowUpRight size={16} />
        </span>
      </section>
      <section className="login-panel">
        <div>
          <p className="eyebrow">WELCOME TO TARA</p>
          <h2>Ready for your next job?</h2>
          <p className="lede">Sign in to your workspace.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
