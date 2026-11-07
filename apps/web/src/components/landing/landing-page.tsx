import "@tara/ui/assistant.css";
import "./landing.css";

import { AssistantMark } from "@tara/ui/components/assistant-status";
import { Button } from "@tara/ui/components/button";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  ClipboardList,
  FileText,
  Focus,
  GitBranch,
  Plus,
  ScanLine,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";

import { LandingPreview } from "./landing-preview";

const workflow = [
  {
    description:
      "Turn your SOP into steps, prerequisites, and clear checkpoints.",
    icon: FileText,
    number: "01",
    title: "Understand",
  },
  {
    description:
      "See where AI can assist, verify, or automate—and where people decide.",
    icon: GitBranch,
    number: "02",
    title: "Optimize",
  },
  {
    description:
      "Give your team the right instruction, right when they need it.",
    icon: Focus,
    number: "03",
    title: "Guide",
  },
  {
    description:
      "Check relevant evidence against the requirements in your SOP.",
    icon: ScanLine,
    number: "04",
    title: "Verify",
  },
  {
    description:
      "Bring progress, corrections, and execution records into one view.",
    icon: ChartNoAxesCombined,
    number: "05",
    title: "Monitor",
  },
];

const questions = [
  {
    answer:
      "tara connects company heads and operational teams. Management prepares and reviews workflows, while frontline workers follow assigned procedures with contextual assistance. Both work from the same SOP and execution records.",
    question: "Who is tara built for?",
  },
  {
    answer:
      "Yes. The workflow starts with your existing PDF or DOCX document. tara extracts steps, prerequisites, risks, and verification criteria for a human to review before the procedure is published for the team.",
    question: "Can we use our existing SOPs?",
  },
  {
    answer:
      "tara brings the issue into focus with contextual guidance. The worker can correct the issue and have the checkpoint checked again. When evidence is insufficient, the workflow should request further verification or human review rather than assume a violation.",
    question: "What happens when a step needs attention?",
  },
  {
    answer:
      "No. AI helps interpret procedures and explain the next action. Checkpoint decisions follow the SOP’s defined criteria, and tasks that need human approval stay with people. AI opportunity mapping makes these responsibilities visible.",
    question: "Does AI make every decision?",
  },
];

function LandingBrand() {
  return (
    <Link aria-label="tara home" className="tara-landing-brand" href="/">
      <AssistantMark />
      <span>
        tara<span className="tara-landing-period">.</span>
      </span>
    </Link>
  );
}

function LandingWorkflow() {
  return (
    <section
      aria-labelledby="workflow-title"
      className="tara-landing-section"
      id="how-it-works"
    >
      <div className="tara-landing-section-heading">
        <div>
          <p className="tara-landing-eyebrow">
            01 / FROM PROCEDURE TO PRACTICE
          </p>
          <h2 id="workflow-title">
            One connected workflow.
            <br />
            From start to standard.
          </h2>
        </div>
        <p>
          Your procedures already hold the knowledge. tara helps turn it into a
          way of working your whole team can follow.
        </p>
      </div>
      <ol className="tara-landing-workflow">
        {workflow.map(({ number, title, icon: Icon, description }) => (
          <li key={number}>
            <div className="tara-landing-flow-top">
              <span>{number}</span>
              <Icon aria-hidden="true" />
            </div>
            <h3>{title}</h3>
            <p>{description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function LandingTeams() {
  return (
    <section
      aria-labelledby="teams-title"
      className="tara-landing-section"
      id="for-teams"
    >
      <div className="tara-landing-section-heading">
        <div>
          <p className="tara-landing-eyebrow">
            02 / BUILT FOR BOTH SIDES OF THE FLOOR
          </p>
          <h2 id="teams-title">
            Your people. Your process.
            <br />
            Finally, on the same page.
          </h2>
        </div>
        <p>
          One shared source of truth, with a focused workspace for the people
          setting the standard and the people putting it into action.
        </p>
      </div>
      <div className="tara-landing-teams">
        <article className="tara-landing-team tara-landing-team-management">
          <div className="tara-landing-team-label">
            <ChartNoAxesCombined aria-hidden="true" />
            <span>FOR MANAGEMENT</span>
          </div>
          <h3>
            See how the work
            <br />
            actually happens.
          </h3>
          <p>
            Bring your procedures into tara, review the workflow, and stay close
            to what needs your attention.
          </p>
          <ul>
            <li>
              <Check aria-hidden="true" />
              Upload and review company SOPs
            </li>
            <li>
              <Check aria-hidden="true" />
              Identify meaningful opportunities for AI
            </li>
            <li>
              <Check aria-hidden="true" />
              Monitor checkpoints, deviations, and records
            </li>
          </ul>
          <figure
            aria-label="Illustrative operational record"
            className="tara-landing-record"
          >
            <div className="tara-landing-record-heading">
              <span>EXECUTION RECORD</span>
              <span>Illustration</span>
            </div>
            <div>
              <span className="tara-landing-record-dot" />
              <strong>Checkpoint verified</strong>
              <span>Evidence attached</span>
            </div>
            <div>
              <span className="tara-landing-record-dot" data-tone="warning" />
              <strong>Review requested</strong>
              <span>Human approval</span>
            </div>
            <div>
              <span className="tara-landing-record-dot" data-tone="active" />
              <strong>Work in progress</strong>
              <span>Current SOP step</span>
            </div>
          </figure>
          <Link className="tara-landing-text-link" href="/register">
            Bring your team to tara <ArrowUpRight aria-hidden="true" />
          </Link>
        </article>
        <article className="tara-landing-team tara-landing-team-worker">
          <div className="tara-landing-team-label">
            <Users aria-hidden="true" />
            <span>FOR FRONTLINE TEAMS</span>
          </div>
          <h3>
            A little guidance.
            <br />
            Right when it matters.
          </h3>
          <p>
            Keep your attention on the task. tara brings the current
            instruction, relevant checks, and next action into focus.
          </p>
          <ul>
            <li>
              <Check aria-hidden="true" />
              Follow your assigned workflow, step by step
            </li>
            <li>
              <Check aria-hidden="true" />
              Get contextual, camera-assisted guidance
            </li>
            <li>
              <Check aria-hidden="true" />
              Resolve issues and continue with clarity
            </li>
          </ul>
          <div className="tara-landing-moment">
            <span className="tara-landing-moment-mark">
              <AssistantMark />
            </span>
            <div>
              <span className="tara-landing-eyebrow">IN THE MOMENT</span>
              <p>“Let’s check this together.”</p>
              <span>The current step. The context you need.</span>
            </div>
          </div>
          <Link className="tara-landing-text-link" href="/login">
            Enter your workspace <ArrowUpRight aria-hidden="true" />
          </Link>
        </article>
      </div>
    </section>
  );
}

function LandingPrinciples() {
  return (
    <section
      aria-labelledby="principles-title"
      className="tara-landing-principles"
      id="approach"
    >
      <div className="tara-landing-principles-intro">
        <span className="tara-landing-principles-icon">
          <ShieldCheck aria-hidden="true" />
        </span>
        <p className="tara-landing-eyebrow">
          03 / INTELLIGENCE WITH ACCOUNTABILITY
        </p>
        <h2 id="principles-title">
          Grounded in your SOPs.
          <br />
          With people in control.
        </h2>
        <p>
          Good guidance starts with knowing what’s required—and when to ask for
          a closer look.
        </p>
      </div>
      <div className="tara-landing-principle-list">
        <article>
          <span>01</span>
          <div>
            <h3>The document stays the source of truth.</h3>
            <p>
              Instructions and verification criteria come from your procedure.
              Review the extracted workflow before your team uses it.
            </p>
          </div>
        </article>
        <article>
          <span>02</span>
          <div>
            <h3>Missing evidence is a reason to check.</h3>
            <p>
              An unclear camera view is not proof of a mistake. Further evidence
              or human verification can resolve uncertainty.
            </p>
          </div>
        </article>
        <article>
          <span>03</span>
          <div>
            <h3>Every checkpoint has a context.</h3>
            <p>
              Connect step transitions, corrections, and approvals to the
              execution record, so teams can understand what happened.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}

export function LandingPage() {
  return (
    <div className="tara-assistant tara-landing">
      <a className="tara-landing-skip" href="#landing-main">
        Skip to content
      </a>
      <header className="tara-landing-header">
        <LandingBrand />
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#for-teams">For teams</a>
          <a href="#approach">Our approach</a>
        </nav>
        <div className="tara-landing-header-actions">
          <Link className="tara-landing-signin" href="/login">
            Sign in
          </Link>
          <Button
            className="tara-landing-button"
            nativeButton={false}
            render={<Link href="/register" />}
            role="link"
          >
            Start tara <ArrowUpRight data-icon="inline-end" />
          </Button>
        </div>
      </header>

      <main id="landing-main" tabIndex={-1}>
        <section aria-labelledby="landing-title" className="tara-landing-hero">
          <div className="tara-landing-hero-copy">
            <p className="tara-landing-eyebrow">
              <span aria-hidden="true" className="tara-landing-dot" /> YOUR
              WORK. IN FOCUS.
            </p>
            <h1 id="landing-title">
              Intelligence
              <br />
              in every
              <br />
              <span>operation.</span>
            </h1>
            <p className="tara-landing-lede">
              From the SOP on your desk to the work in your hands. tara connects
              your procedures, your people, and what happens on the floor.
            </p>
            <div className="tara-landing-hero-actions">
              <Button
                className="tara-landing-button"
                nativeButton={false}
                render={<Link href="/register" />}
                role="link"
                size="lg"
              >
                Start tara <ArrowRight data-icon="inline-end" />
              </Button>
              <a className="tara-landing-text-link" href="#how-it-works">
                See how it works <ArrowDown aria-hidden="true" />
              </a>
            </div>
            <p className="tara-landing-hero-note">
              <ShieldCheck aria-hidden="true" /> Your standards, with human
              oversight.
            </p>
          </div>
          <div className="tara-landing-hero-product">
            <LandingPreview />
            <div className="tara-landing-preview-caption">
              <span>A clearer next step. A calmer way to work.</span>
              <Link href="/assistant">
                Explore the assistant demo <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <div className="tara-landing-intro-strip">
          <p>
            Close the gap between
            <br />
            <strong>the procedure and the practice.</strong>
          </p>
          <div>
            <FileText aria-hidden="true" />
            <span>Your existing SOPs</span>
          </div>
          <span aria-hidden="true" className="tara-landing-strip-line" />
          <div>
            <ScanLine aria-hidden="true" />
            <span>Guided execution</span>
          </div>
          <span aria-hidden="true" className="tara-landing-strip-line" />
          <div>
            <ClipboardList aria-hidden="true" />
            <span>A clear record</span>
          </div>
        </div>

        <LandingWorkflow />
        <LandingTeams />
        <LandingPrinciples />

        <section
          aria-labelledby="questions-title"
          className="tara-landing-faq tara-landing-section"
        >
          <div>
            <p className="tara-landing-eyebrow">A FEW THINGS TO KNOW</p>
            <h2 id="questions-title">A clearer picture.</h2>
            <p>
              Before you bring your first
              <br />
              procedure into focus.
            </p>
          </div>
          <div className="tara-landing-questions">
            {questions.map(({ question, answer }) => (
              <details key={question}>
                <summary>
                  {question}
                  <Plus aria-hidden="true" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby="start-title" className="tara-landing-start">
          <div>
            <p className="tara-landing-eyebrow">YOUR NEXT STEP STARTS HERE</p>
            <h2 id="start-title">
              Good work starts
              <br />
              with clear guidance.
            </h2>
            <p>Bring your first SOP. Put your team’s knowledge to work.</p>
          </div>
          <div className="tara-landing-start-actions">
            <Button
              className="tara-landing-button"
              nativeButton={false}
              render={<Link href="/register" />}
              role="link"
              size="lg"
            >
              Start tara <ArrowRight data-icon="inline-end" />
            </Button>
            <span>
              Already on a team? <Link href="/login">Sign in</Link>
            </span>
          </div>
          <div aria-hidden="true" className="tara-landing-start-mark">
            <AssistantMark />
          </div>
        </section>
      </main>

      <footer className="tara-landing-footer">
        <div>
          <LandingBrand />
          <p>Intelligence in Every Operation.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="#how-it-works">How it works</a>
          <Link href="/login">Sign in</Link>
          <Link href="/register">Create an account</Link>
        </nav>
        <p>
          Built for the Sea × OpenAI
          <br />
          Regional Codex Hackathon · Indonesia 2026
        </p>
      </footer>
    </div>
  );
}
