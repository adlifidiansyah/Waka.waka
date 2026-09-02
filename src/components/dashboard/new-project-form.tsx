"use client";

import { useActionState } from "react";
import { createProject } from "@/actions/projects";
import { Card, CardBody } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/actions/types";

const INITIAL: ActionState = {};

export function NewProjectForm() {
  const [state, formAction] = useActionState(createProject, INITIAL);

  return (
    <Card>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="title">
              Project title
            </label>
            <input
              id="title"
              name="title"
              className="input mt-1"
              placeholder="Aurora Coffee — Website Rebuild"
              maxLength={160}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="clientName">
                Client name
              </label>
              <input
                id="clientName"
                name="clientName"
                className="input mt-1"
                placeholder="Maya Rahmawati"
                maxLength={120}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="clientEmail">
                Client email
              </label>
              <input
                id="clientEmail"
                name="clientEmail"
                type="email"
                className="input mt-1"
                placeholder="maya@auroracoffee.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="description">
              Scope summary <span className="font-normal text-ink-400">(optional)</span>
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              className="input mt-1 resize-y"
              placeholder="What's in scope, in a sentence or two your client would recognise."
              maxLength={2000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <div>
              <label className="label" htmlFor="budget">
                Total budget
              </label>
              <input
                id="budget"
                name="budget"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                className="input mt-1"
              />
            </div>
            <div>
              <label className="label" htmlFor="currency">
                Currency
              </label>
              <select id="currency" name="currency" className="input mt-1" defaultValue="USD">
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="AUD">AUD</option>
                <option value="SGD">SGD</option>
                <option value="IDR">IDR</option>
              </select>
            </div>
          </div>

          <FormMessage error={state.error} success={state.success} />

          <SubmitButton>Create project</SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}
