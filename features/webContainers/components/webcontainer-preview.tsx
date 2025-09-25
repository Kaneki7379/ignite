"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TemplateFolder } from "@/features/playground/lib/path-to-json";
import { transformToWebContainerFormat } from "../hooks/transformer";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import TerminalComponent, { TerminalRef } from "./terminal";
import type { ServerReadyListener, WebContainer } from "@webcontainer/api";

type StepKey = "transforming" | "mounting" | "installing" | "starting";

const steps: { key: StepKey; label: string }[] = [
  { key: "transforming", label: "Transforming template data" },
  { key: "mounting", label: "Mounting files" },
  { key: "installing", label: "Installing dependencies" },
  { key: "starting", label: "Starting development server" },
];

interface WebContainerPreviewProps {
  templateData: TemplateFolder;
  serverUrl: string;
  isLoading: boolean;
  error: string | null;
  instance: WebContainer | null;
  writeFileSync: (path: string, content: string) => Promise<void>;
  forceResetup?: boolean;
}

const WebContainerPreview: React.FC<WebContainerPreviewProps> = ({
  templateData,
  error,
  instance,
  isLoading,
  serverUrl,
  forceResetup = false,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string>(serverUrl ?? "");
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = steps.length;
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [isSetupInProgress, setIsSetupInProgress] = useState(false);
  const [stepDurations, setStepDurations] = useState<Record<StepKey, number>>({
    transforming: 0,
    mounting: 0,
    installing: 0,
    starting: 0,
  });

  const terminalRef = useRef<TerminalRef | null>(null);
  const serverReadyUnsubscribe = useRef<(() => void) | null>(null);
  const stepTimers = useRef<Record<StepKey, number | null>>({
    transforming: null,
    mounting: null,
    installing: null,
    starting: null,
  });
  const installSlowTimerRef = useRef<number | null>(null);
  const packageHashFilePath = ".stackblitz-cache/package-json.hash";

  const computeTemplateHash = useCallback(async () => {
    if (typeof window === "undefined" || !window.crypto?.subtle || !packageJsonFromTemplate) {
      return null;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(packageJsonFromTemplate);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch (hashError) {
      console.warn("Failed to compute package.json hash", hashError);
      return null;
    }
  }, [packageJsonFromTemplate]);

  const detachServerReadyListener = useCallback(() => {
    serverReadyUnsubscribe.current?.();
    serverReadyUnsubscribe.current = null;
  }, []);

  const attachServerReadyListener = useCallback(
    (listener: ServerReadyListener) => {
      detachServerReadyListener();
      serverReadyUnsubscribe.current = instance?.on("server-ready", listener) ?? null;
    },
    [detachServerReadyListener, instance],
  );

  const getNow = useCallback(() => {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }

    return Date.now();
  }, []);

  const markStepStart = useCallback(
    (step: StepKey) => {
      stepTimers.current[step] = getNow();

      if (step === "installing" && installSlowTimerRef.current === null && typeof window !== "undefined") {
        installSlowTimerRef.current = window.setTimeout(() => {
          if (terminalRef.current?.writeToTerminal) {
            terminalRef.current.writeToTerminal(
              "⏳ Still installing dependencies... large packages (for example Prisma) can take up to a minute on first setup.\r\n",
            );
          }
        }, 15000);
      }
    },
    [getNow],
  );

  const markStepEnd = useCallback(
    (step: StepKey) => {
      const start = stepTimers.current[step];
      if (start === null) {
        return 0;
      }

      const duration = Math.max(0, getNow() - start);
      stepTimers.current[step] = null;

      if (step === "installing" && installSlowTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(installSlowTimerRef.current);
        installSlowTimerRef.current = null;
      }

      setStepDurations((prev) => ({
        ...prev,
        [step]: duration,
      }));

      return duration;
    },
    [getNow],
  );

  const resetStepTracking = useCallback(() => {
    steps.forEach((step) => {
      stepTimers.current[step.key] = null;
    });
    setStepDurations({
      transforming: 0,
      mounting: 0,
      installing: 0,
      starting: 0,
    });
    if (installSlowTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(installSlowTimerRef.current);
      installSlowTimerRef.current = null;
    }
  }, []);

  const formatDuration = useCallback((ms: number | undefined) => {
    if (!ms || Number.isNaN(ms) || ms <= 0) {
      return "";
    }

    const seconds = ms / 1000;
    if (seconds < 1) {
      return `${seconds.toFixed(2)}s`;
    }
    if (seconds < 10) {
      return `${seconds.toFixed(1)}s`;
    }
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);

    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }

    return `${minutes}m ${remainingSeconds}s`;
  }, []);

  const slowestStep = useMemo(() => {
    return steps.reduce<{ key: StepKey; duration: number } | null>((acc, step) => {
      const duration = stepDurations[step.key];
      if (!duration) {
        return acc;
      }

      if (!acc || duration > acc.duration) {
        return { key: step.key, duration };
      }

      return acc;
    }, null);
  }, [stepDurations]);

  const packageJsonFromTemplate = useMemo(() => {
    const stack = [...templateData.items];

    while (stack.length > 0) {
      const item = stack.pop();
      if (!item) continue;

      if (item.fileExtension && `${item.filename}.${item.fileExtension}` === "package.json") {
        return item.content;
      }

      if (item.items) {
        stack.push(...item.items);
      }
    }

    return null;
  }, [templateData]);

  const templatePackageJson = useMemo(() => {
    if (!packageJsonFromTemplate) {
      return null;
    }

    try {
      return JSON.parse(packageJsonFromTemplate) as Record<string, unknown>;
    } catch (jsonError) {
      console.warn("Unable to parse template package.json", jsonError);
      return null;
    }
  }, [packageJsonFromTemplate]);

  const hasPrismaDependency = Boolean(
    templatePackageJson && typeof templatePackageJson === "object"
      ? (templatePackageJson as { dependencies?: Record<string, unknown> }).dependencies?.["@prisma/client"]
      : false,
  );

  useEffect(() => {
    if (forceResetup) {
      setIsSetupComplete(false);
      setIsSetupInProgress(false);
      setPreviewUrl("");
      setCurrentStep(0);
      resetStepTracking();
    }
  }, [forceResetup, resetStepTracking]);

  useEffect(() => {
    async function setupContainer() {
      if (!instance || isSetupComplete || isSetupInProgress) {
        return;
      }

      try {
        setIsSetupInProgress(true);
        setSetupError(null);

        try {
          const packageJsonExists = await instance.fs.readFile("package.json", "utf8");
          if (packageJsonExists) {
            if (terminalRef.current?.writeToTerminal) {
              terminalRef.current.writeToTerminal("🔄 Reconnecting to existing WebContainer session...\r\n");
            }

            markStepStart("starting");
            attachServerReadyListener((port: number, url: string) => {
              const startDuration = markStepEnd("starting");
              console.log(`Reconnected to server on port ${port} at ${url}`);
              if (terminalRef.current?.writeToTerminal) {
                terminalRef.current.writeToTerminal(`🌐 Reconnected to server at ${url}\r\n`);
                if (startDuration) {
                  terminalRef.current.writeToTerminal(
                    `⏱️ Dev server responded in ${formatDuration(startDuration)} after reconnect.\r\n`,
                  );
                }
              }
              setPreviewUrl(url);
              setIsSetupComplete(true);
              setIsSetupInProgress(false);
            });

            setCurrentStep(4);
            return;
          }
        } catch (fsError) {
          console.info("No existing project in WebContainer, performing fresh setup", fsError);
        }

        markStepStart("transforming");
        setCurrentStep(1);

        if (terminalRef.current?.writeToTerminal) {
          terminalRef.current.writeToTerminal("🔄 Transforming template data...\r\n");
        }

        // @ts-expect-error - template JSON includes nested folder metadata only present at runtime
        const files = transformToWebContainerFormat(templateData);

        const transformDuration = markStepEnd("transforming");
        if (transformDuration && terminalRef.current?.writeToTerminal) {
          terminalRef.current.writeToTerminal(`⏱️ Template transformed in ${formatDuration(transformDuration)}\r\n`);
        }

        setCurrentStep(2);

        markStepStart("mounting");

        if (terminalRef.current?.writeToTerminal) {
          terminalRef.current.writeToTerminal("📁 Mounting files to WebContainer...\r\n");
        }

        await instance.mount(files);

        if (terminalRef.current?.writeToTerminal) {
          terminalRef.current.writeToTerminal("✅ Files mounted successfully\r\n");
        }

        const mountDuration = markStepEnd("mounting");
        if (mountDuration && terminalRef.current?.writeToTerminal) {
          terminalRef.current.writeToTerminal(`⏱️ Mounting completed in ${formatDuration(mountDuration)}\r\n`);
        }

        setCurrentStep(3);

        markStepStart("installing");

        if (terminalRef.current?.writeToTerminal) {
          terminalRef.current.writeToTerminal("📦 Installing dependencies...\r\n");
          if (hasPrismaDependency) {
            terminalRef.current.writeToTerminal(
              "🔍 Detected @prisma/client in dependencies — generating the Prisma client adds extra install time.\r\n",
            );
          }
        }

        const npmSpawnOptions = {
          env: {
            NODE_OPTIONS: "",
            npm_config_audit: "false",
            npm_config_fund: "false",
            npm_config_update_notifier: "false",
            npm_config_optional: "false",
          },
        };

        let nodeModulesExists = false;
        try {
          await instance.fs.readdir("node_modules");
          nodeModulesExists = true;
        } catch {
          nodeModulesExists = false;
        }

        const templatePackageHash = await computeTemplateHash();

        let cachedPackageHash: string | null = null;
        try {
          cachedPackageHash = await instance.fs.readFile(packageHashFilePath, "utf-8");
        } catch {
          cachedPackageHash = null;
        }

        let shouldInstall = true;

        if (nodeModulesExists && templatePackageHash && cachedPackageHash === templatePackageHash) {
          shouldInstall = false;
        }

        if (!shouldInstall) {
          if (terminalRef.current?.writeToTerminal) {
            terminalRef.current.writeToTerminal(
              "⚡ Dependencies unchanged since last setup, reusing existing node_modules\r\n",
            );
          }
          const skippedDuration = markStepEnd("installing");
          if (skippedDuration && terminalRef.current?.writeToTerminal) {
            terminalRef.current.writeToTerminal(
              `⏱️ Dependency check completed in ${formatDuration(skippedDuration)}\r\n`,
            );
          }
        }

        if (shouldInstall) {
          if (nodeModulesExists && terminalRef.current?.writeToTerminal) {
            terminalRef.current.writeToTerminal(
              "♻️ Detected package.json changes, reinstalling dependencies from scratch\r\n",
            );
          }

          const installProcess = await instance.spawn(
            "npm",
            ["install", "--prefer-offline", "--no-audit", "--progress=false"],
            npmSpawnOptions,
          );

          installProcess.output.pipeTo(
            new WritableStream({
              write(data) {
                if (terminalRef.current?.writeToTerminal) {
                  terminalRef.current.writeToTerminal(data);
                }
              },
            }),
          );

          const installExitCode = await installProcess.exit;

          if (installExitCode !== 0) {
            throw new Error(`Failed to install dependencies. Exit code: ${installExitCode}`);
          }

          if (terminalRef.current?.writeToTerminal) {
            terminalRef.current.writeToTerminal("✅ Dependencies installed successfully\r\n");
          }

          const installDuration = markStepEnd("installing");
          if (installDuration && terminalRef.current?.writeToTerminal) {
            terminalRef.current.writeToTerminal(`⏱️ Install completed in ${formatDuration(installDuration)}\r\n`);
          }

          if (templatePackageHash) {
            const cacheDir = ".stackblitz-cache";
            try {
              await instance.fs.mkdir(cacheDir);
            } catch (mkdirError) {
              if ((mkdirError as { code?: string })?.code !== "EEXIST") {
                console.warn("Failed to ensure cache directory", mkdirError);
              }
            }

            try {
              await instance.fs.writeFile(packageHashFilePath, templatePackageHash, "utf-8");
            } catch (writeError) {
              console.warn("Failed to persist package hash", writeError);
            }
          }
        }

        setCurrentStep(4);

        markStepStart("starting");

        if (terminalRef.current?.writeToTerminal) {
          terminalRef.current.writeToTerminal("🚀 Starting development server...\r\n");
        }

        let selectedScript: string | null = null;

        try {
          const packageJsonRaw = await instance.fs.readFile("package.json", "utf-8");
          const packageJson = JSON.parse(packageJsonRaw ?? "{}");
          const scripts = packageJson?.scripts ?? {};

          if (typeof scripts.dev === "string") {
            selectedScript = "dev";
          } else if (typeof scripts.start === "string") {
            selectedScript = "start";
          }
        } catch (packageJsonError) {
          console.warn("Unable to determine package scripts, defaulting to npm start", packageJsonError);
        }

        if (!selectedScript) {
          selectedScript = "start";
        }

        if (terminalRef.current?.writeToTerminal) {
          terminalRef.current.writeToTerminal(`▶️ Running npm run ${selectedScript}\r\n`);
        }

        const startProcess = await instance.spawn("npm", ["run", selectedScript], npmSpawnOptions);

        attachServerReadyListener((port: number, url: string) => {
          const startDuration = markStepEnd("starting");
          console.log(`Server ready on port ${port} at ${url}`);
          if (terminalRef.current?.writeToTerminal) {
            terminalRef.current.writeToTerminal(`🌐 Server ready at ${url}\r\n`);
            if (startDuration) {
              terminalRef.current.writeToTerminal(`⏱️ Dev server booted in ${formatDuration(startDuration)}\r\n`);
            }
          }
          setPreviewUrl(url);
          setIsSetupComplete(true);
          setIsSetupInProgress(false);
        });

        startProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              if (terminalRef.current?.writeToTerminal) {
                terminalRef.current.writeToTerminal(data);
              }
            },
          }),
        );

        startProcess.exit
          .then((exitCode) => {
            if (exitCode !== 0 && terminalRef.current?.writeToTerminal) {
              terminalRef.current.writeToTerminal(`❌ Dev server exited with code ${exitCode}\r\n`);
            }
          })
          .catch((exitError) => {
            console.error("Failed to monitor dev server exit", exitError);
          });
      } catch (setupErr) {
        console.error("Error setting up container:", setupErr);
        const errorMessage = setupErr instanceof Error ? setupErr.message : String(setupErr);

        steps.forEach((step) => {
          if (stepTimers.current[step.key] !== null) {
            markStepEnd(step.key);
          }
        });

        if (terminalRef.current?.writeToTerminal) {
          terminalRef.current.writeToTerminal(`❌ Error: ${errorMessage}\r\n`);
        }

        detachServerReadyListener();

        setSetupError(errorMessage);
        setIsSetupInProgress(false);
        resetStepTracking();
      }
    }

    setupContainer();
  }, [
    attachServerReadyListener,
    formatDuration,
    hasPrismaDependency,
    instance,
    isSetupComplete,
    isSetupInProgress,
    detachServerReadyListener,
    resetStepTracking,
    markStepEnd,
    markStepStart,
    computeTemplateHash,
    templateData,
  ]);

  useEffect(() => {
    return () => {
      detachServerReadyListener();
      if (installSlowTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(installSlowTimerRef.current);
        installSlowTimerRef.current = null;
      }
    };
  }, [detachServerReadyListener]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md p-6 rounded-lg bg-gray-50 dark:bg-gray-900">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <h3 className="text-lg font-medium">Initializing WebContainer</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Setting up the environment for your project...
          </p>
        </div>
      </div>
    );
  }

  if (error || setupError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-6 rounded-lg max-w-md">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="h-5 w-5" />
            <h3 className="font-semibold">Error</h3>
          </div>
          <p className="text-sm">{error || setupError}</p>
        </div>
      </div>
    );
  }

  const getStepIcon = (stepIndex: number) => {
    if (stepIndex < currentStep) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    if (stepIndex === currentStep) {
      return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    }
    return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
  };

  const getStepText = (stepIndex: number, step: { key: StepKey; label: string }) => {
    const isActive = stepIndex === currentStep;
    const isComplete = stepIndex < currentStep;
    const durationLabel = formatDuration(stepDurations[step.key]);

    return (
      <span
        className={`text-sm font-medium ${
          isComplete ? "text-green-600" : isActive ? "text-blue-600" : "text-gray-500"
        }`}
      >
        {step.label}
        {durationLabel ? ` (${durationLabel})` : ""}
      </span>
    );
  };

  return (
    <div className="h-full w-full flex flex-col">
      {!previewUrl ? (
        <div className="h-full flex flex-col">
          <div className="w-full max-w-md p-6 m-5 rounded-lg bg-white dark:bg-zinc-800 shadow-sm mx-auto">
            <Progress value={(currentStep / totalSteps) * 100} className="h-2 mb-6" />

            <div className="space-y-4 mb-6">
              {steps.map((step, index) => (
                <div className="flex items-center gap-3" key={step.key}>
                  {getStepIcon(index + 1)}
                  {getStepText(index + 1, step)}
                </div>
              ))}
            </div>

            {slowestStep ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Slowest step so far: {steps.find((step) => step.key === slowestStep.key)?.label ?? ""}
                {" "}
                ({formatDuration(slowestStep.duration)}).
              </p>
            ) : null}
          </div>

          <div className="flex-1 p-4">
            <TerminalComponent ref={terminalRef} webContainerInstance={instance} theme="dark" className="h-full" />
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col">
          <div className="flex-1">
            <iframe src={previewUrl} className="w-full h-full border-none" title="WebContainer Preview" />
          </div>

          <div className="h-64 border-t">
            <TerminalComponent ref={terminalRef} webContainerInstance={instance} theme="dark" className="h-full" />
          </div>
        </div>
      )}
    </div>
  );
};

export default WebContainerPreview;
