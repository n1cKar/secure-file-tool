"use client";

import { useMemo } from "react";

function estimateStrength(pw: string) {
  if (!pw) return { score: 0, label: "Too short" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (pw.length >= 16) score++;
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong", "Very strong", "Excellent"];
  return { score, label: labels[Math.min(score, labels.length - 1)] };
}

export default function PasswordStrength({ password }: { password: string }) {
  const { score, label } = useMemo(() => estimateStrength(password), [password]);
  const pct = Math.min(100, Math.round((score / 6) * 100));

  return (
    <div className="space-y-1">
      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className="h-2 rounded-full bg-green-500 transition-all dark:bg-green-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
