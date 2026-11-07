"use client";

import { Button } from "@tara/ui/components/button";
import { Input } from "@tara/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@tara/ui/components/input-group";
import { Label } from "@tara/ui/components/label";
import { cn } from "@tara/ui/lib/utils";
import { ArrowRight, Eye, EyeOff, Info } from "lucide-react";
import Link from "next/link";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";

const MIN_PASSWORD_LENGTH = 16;
const MAX_NAME_LENGTH = 200;
const MAX_USERNAME_LENGTH = 100;

interface RegistrationDetails {
  companyName: string;
  confirmPassword: string;
  name: string;
  password: string;
  username: string;
}

type RegistrationErrors = Partial<Record<keyof RegistrationDetails, string>>;

function validateDetails(details: RegistrationDetails): RegistrationErrors {
  const errors: RegistrationErrors = {};

  if (!details.name.trim()) {
    errors.name = "Enter your full name.";
  } else if (details.name.trim().length > MAX_NAME_LENGTH) {
    errors.name = `Use ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  if (!details.companyName.trim()) {
    errors.companyName = "Enter your company name.";
  }

  if (!details.username.trim()) {
    errors.username = "Choose a username for signing in.";
  } else if (details.username.trim().length > MAX_USERNAME_LENGTH) {
    errors.username = `Use ${MAX_USERNAME_LENGTH} characters or fewer.`;
  }

  if (details.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (!details.confirmPassword) {
    errors.confirmPassword = "Enter your password again.";
  } else if (details.confirmPassword !== details.password) {
    errors.confirmPassword = "Your passwords do not match.";
  }

  return errors;
}

function FieldError({ error, id }: { error?: string; id: string }) {
  if (!error) {
    return null;
  }

  return (
    <p className="tara-auth-field-error" id={id}>
      {error}
    </p>
  );
}

interface PasswordFieldProps {
  error?: string;
  label: string;
  name: "password" | "confirmPassword";
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

function PasswordField({ error, label, name, onChange }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputId = `register-${name}`;
  const errorId = `${inputId}-error`;
  const isPassword = name === "password";
  const descriptionId = isPassword ? "register-password-hint" : undefined;

  const toggleVisibility = useCallback(() => {
    setVisible((current) => !current);
  }, []);

  return (
    <div className="tara-auth-field" data-invalid={Boolean(error)}>
      <Label className="tara-auth-label" htmlFor={inputId}>
        {label}
      </Label>
      <InputGroup
        aria-label={label}
        className="tara-auth-input-wrap"
        controlId={inputId}
      >
        <InputGroupInput
          aria-describedby={error ? errorId : descriptionId}
          aria-invalid={Boolean(error)}
          autoComplete="new-password"
          className="tara-auth-input"
          id={inputId}
          minLength={MIN_PASSWORD_LENGTH}
          name={name}
          onChange={onChange}
          placeholder={
            isPassword ? "Create a password" : "Re-enter your password"
          }
          required
          type={visible ? "text" : "password"}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-controls={inputId}
            aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-pressed={visible}
            className="tara-auth-password-toggle"
            onClick={toggleVisibility}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {visible ? (
              <EyeOff aria-hidden="true" data-icon="inline-start" />
            ) : (
              <Eye aria-hidden="true" data-icon="inline-start" />
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {isPassword ? (
        <p className="tara-auth-note" id="register-password-hint">
          At least {MIN_PASSWORD_LENGTH} characters. A memorable phrase works
          well.
        </p>
      ) : null}
      <FieldError error={error} id={errorId} />
    </div>
  );
}

export function RegistrationForm() {
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [reviewed, setReviewed] = useState(false);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const { name } = event.currentTarget;
    setReviewed(false);
    setErrors((current) => ({
      ...current,
      [name]: undefined,
      ...(name === "password" ? { confirmPassword: undefined } : {}),
    }));
  }, []);

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setReviewed(false);

    const form = event.currentTarget;
    const data = new FormData(form);
    const details: RegistrationDetails = {
      companyName: String(data.get("companyName") ?? ""),
      confirmPassword: String(data.get("confirmPassword") ?? ""),
      name: String(data.get("name") ?? ""),
      password: String(data.get("password") ?? ""),
      username: String(data.get("username") ?? ""),
    };
    const nextErrors = validateDetails(details);
    setErrors(nextErrors);

    const [firstInvalidField] = Object.keys(nextErrors);
    if (firstInvalidField) {
      requestAnimationFrame(() => {
        form
          .querySelector<HTMLInputElement>(`[name="${firstInvalidField}"]`)
          ?.focus();
      });
      return;
    }

    // The public registration API is not implemented yet; review stays local.
    setReviewed(true);
  }, []);

  return (
    <form
      aria-describedby="registration-availability"
      className="tara-auth-form"
      method="post"
      noValidate
      onSubmit={handleSubmit}
    >
      <p className="tara-auth-note" id="registration-availability">
        <Info aria-hidden="true" />
        <span>
          Registration is not open yet. You can review your details below; no
          account will be created.
        </span>
      </p>

      <div className="tara-auth-field-row">
        <div className="tara-auth-field" data-invalid={Boolean(errors.name)}>
          <Label className="tara-auth-label" htmlFor="register-name">
            Full name
          </Label>
          <Input
            aria-describedby={errors.name ? "register-name-error" : undefined}
            aria-invalid={Boolean(errors.name)}
            autoComplete="name"
            className="tara-auth-input"
            id="register-name"
            maxLength={MAX_NAME_LENGTH}
            name="name"
            onChange={handleChange}
            placeholder="Your full name"
            required
          />
          <FieldError error={errors.name} id="register-name-error" />
        </div>

        <div
          className="tara-auth-field"
          data-invalid={Boolean(errors.companyName)}
        >
          <Label className="tara-auth-label" htmlFor="register-companyName">
            Company name
          </Label>
          <Input
            aria-describedby={
              errors.companyName ? "register-companyName-error" : undefined
            }
            aria-invalid={Boolean(errors.companyName)}
            autoComplete="organization"
            className="tara-auth-input"
            id="register-companyName"
            name="companyName"
            onChange={handleChange}
            placeholder="Your company"
            required
          />
          <FieldError
            error={errors.companyName}
            id="register-companyName-error"
          />
        </div>
      </div>

      <div className="tara-auth-field" data-invalid={Boolean(errors.username)}>
        <Label className="tara-auth-label" htmlFor="register-username">
          Username
        </Label>
        <Input
          aria-describedby={
            errors.username
              ? "register-username-error"
              : "register-username-hint"
          }
          aria-invalid={Boolean(errors.username)}
          autoCapitalize="none"
          autoComplete="username"
          className="tara-auth-input"
          id="register-username"
          maxLength={MAX_USERNAME_LENGTH}
          name="username"
          onChange={handleChange}
          placeholder="Choose your username"
          required
          spellCheck={false}
        />
        <p className="tara-auth-note" id="register-username-hint">
          You will use this to sign in to TARA.
        </p>
        <FieldError error={errors.username} id="register-username-error" />
      </div>

      <PasswordField
        error={errors.password}
        label="Password"
        name="password"
        onChange={handleChange}
      />
      <PasswordField
        error={errors.confirmPassword}
        label="Confirm password"
        name="confirmPassword"
        onChange={handleChange}
      />

      <p
        aria-atomic="true"
        aria-live="polite"
        className={cn(reviewed ? "tara-auth-status" : "sr-only")}
        role="status"
      >
        {reviewed
          ? "Your details are ready. Account creation will be available once registration opens. No account has been created."
          : null}
      </p>

      <Button className="tara-auth-submit" type="submit">
        Review details
        <ArrowRight aria-hidden="true" data-icon="inline-end" />
      </Button>

      <p className="tara-auth-alternate">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
      <p className="tara-auth-note">
        Joining as an employee? Sign in with the account assigned by your
        company.
      </p>
    </form>
  );
}
