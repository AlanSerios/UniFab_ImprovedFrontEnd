import { Check } from "lucide-react";

export function Stepper({ steps, currentStatus }) {
  const currentIndex = steps.findIndex((step) => step.id === currentStatus);
  const isRejected = currentStatus === "rejected";

  return (
    <nav aria-label="Progress">
      <ol role="list" className="overflow-hidden rounded-md border border-slate-200 bg-white lg:flex lg:rounded-none lg:border-l-0 lg:border-r-0 lg:border-slate-200">
        {steps.map((step, stepIdx) => {
          const isCompleted = currentIndex > stepIdx;
          const isCurrent = currentIndex === stepIdx;

          return (
            <li key={step.id} className="relative overflow-hidden lg:flex-1">
              <div
                className={`border-b-2 border-slate-200 lg:border-b-0 lg:border-t-2 ${
                  isCompleted ? "border-indigo-600" : isCurrent && !isRejected ? "border-indigo-600" : "border-transparent"
                }`}
              >
                <div className="group flex items-center px-6 py-5 text-sm font-medium">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-slate-300">
                    {isCompleted ? (
                      <div className="flex h-full w-full items-center justify-center rounded-full bg-indigo-600">
                        <Check className="h-6 w-6 text-white" aria-hidden="true" />
                      </div>
                    ) : isCurrent && !isRejected ? (
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-indigo-600">
                        <span className="text-indigo-600">{stepIdx + 1}</span>
                      </span>
                    ) : isRejected && isCurrent ? (
                       <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-red-600">
                         <span className="text-red-600">X</span>
                       </span>
                    ) : (
                      <span className="text-slate-500">{stepIdx + 1}</span>
                    )}
                  </span>
                  <span className="ml-4 text-sm font-medium">
                    <span className={isCompleted ? "text-indigo-600" : isCurrent && !isRejected ? "text-indigo-600" : isRejected && isCurrent ? "text-red-600" : "text-slate-500"}>
                      {step.name}
                    </span>
                  </span>
                </div>
                {stepIdx !== steps.length - 1 ? (
                  <>
                    <div className="absolute right-0 top-0 hidden h-full w-5 lg:block" aria-hidden="true">
                      <svg
                        className="h-full w-full text-slate-300"
                        viewBox="0 0 22 80"
                        fill="none"
                        preserveAspectRatio="none"
                      >
                        <path
                          d="M0 -2L20 40L0 82"
                          vectorEffect="non-scaling-stroke"
                          stroke="currentcolor"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
