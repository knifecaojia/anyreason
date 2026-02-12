interface ErrorState {
  errors?: {
    [key: string]: string | string[];
  };
  server_validation_error?: string;
  server_error?: string;
}

interface FormErrorProps {
  state?: ErrorState;
  className?: string;
}

function decodeUtf8Mojibake(value: string): string {
  if (!value) return value;
  const hasCjk = /[\u4e00-\u9fff]/.test(value);
  const looksLikeMojibake = !hasCjk && /[ÃÂåæçœ™]/.test(value);
  if (!looksLikeMojibake) return value;
  try {
    const bytes = Uint8Array.from(value, (c) => c.charCodeAt(0) & 0xff);
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (/[\u4e00-\u9fff]/.test(decoded) && !decoded.includes("\uFFFD")) return decoded;
  } catch {
    return value;
  }
  return value;
}

export function FormError({ state, className = "" }: FormErrorProps) {
  if (!state) return null;

  const error = state.server_validation_error || state.server_error;
  if (!error) return null;

  return <p className={`text-sm text-red-500 ${className}`}>{decodeUtf8Mojibake(error)}</p>;
}

interface FieldErrorProps {
  state?: ErrorState;
  field: string;
  className?: string;
}

export function FieldError({ state, field, className = "" }: FieldErrorProps) {
  if (!state?.errors) return null;

  const error = state.errors[field];
  if (!error) return null;

  if (Array.isArray(error)) {
    return (
      <div className={`text-sm text-red-500 ${className}`}>
        <ul className="list-disc ml-4">
          {error.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      </div>
    );
  }

  return <p className={`text-sm text-red-500 ${className}`}>{error}</p>;
}
