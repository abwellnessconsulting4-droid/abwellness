"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";

/**
 * useActionState for forms, without React 19's automatic form reset.
 *
 * With <form action={fn}>, React resets every uncontrolled field after the
 * action finishes, even when the server returned a validation error, so the
 * user loses what they typed (a whole clinical note, for example). This hook
 * submits through onSubmit instead (keeping the clicked button's name/value,
 * e.g. intent="sign"), and only clears the form after a successful result
 * when `resetOnSuccess` is set.
 */
export function useActionForm<S extends { error?: string }>(
  action: (state: Awaited<S>, payload: FormData) => S | Promise<S>,
  initialState: Awaited<S>,
  options: { resetOnSuccess?: boolean } = {},
) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initialState);
  const lastForm = useRef<HTMLFormElement | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (!submitted.current || pending) return;
    submitted.current = false;
    if (options.resetOnSuccess && !(state as { error?: string }).error) lastForm.current?.reset();
  }, [state, pending, options.resetOnSuccess]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    lastForm.current = form;
    submitted.current = true;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(form, submitter);
    startTransition(() => dispatch(data));
  };

  return [state, { onSubmit }, pending] as const;
}
