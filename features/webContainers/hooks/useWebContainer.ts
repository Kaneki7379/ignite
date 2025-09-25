import { useState, useEffect, useCallback } from 'react';
import { WebContainer } from '@webcontainer/api';
import { TemplateFolder } from '@/features/playground/lib/path-to-json';

interface UseWebContainerProps {
  templateData: TemplateFolder;
}

interface UseWebContainerReturn {
  serverUrl: string | null;
  isLoading: boolean;
  error: string | null;
  instance: WebContainer | null;
  writeFileSync: (path: string, content: string) => Promise<void>;
  destroy: () => void; // Added destroy function
}

export const useWebContainer = ({ templateData }: UseWebContainerProps): UseWebContainerReturn => {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<WebContainer | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let isActive = true;
    let bootedInstance: WebContainer | null = null;

    async function initializeWebContainer() {
      try {
        if (!window.crossOriginIsolated) {
          console.error('WebContainers require cross-origin isolation headers to run.');
          if (isActive) {
            setError('WebContainers require cross-origin isolation headers to run.');
            setIsLoading(false);
          }
          return;
        }

        const webcontainerInstance = await WebContainer.boot();

        if (!isActive) {
          await webcontainerInstance.teardown();
          return;
        }

        bootedInstance = webcontainerInstance;
        setInstance(webcontainerInstance);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize WebContainer:', err);
        if (isActive) {
          setError(err instanceof Error ? err.message : 'Failed to initialize WebContainer');
          setIsLoading(false);
        }
      }
    }

    initializeWebContainer();

    return () => {
      isActive = false;

      if (bootedInstance) {
        void bootedInstance.teardown().catch((teardownError) => {
          console.error('Failed to teardown WebContainer:', teardownError);
        });
        bootedInstance = null;
      }
    };
  }, []);

  const writeFileSync = useCallback(async (path: string, content: string): Promise<void> => {
    if (!instance) {
      throw new Error('WebContainer instance is not available');
    }

    try {
      // Ensure the folder structure exists
      const pathParts = path.split('/');
      const folderPath = pathParts.slice(0, -1).join('/'); // Extract folder path

      if (folderPath) {
        await instance.fs.mkdir(folderPath, { recursive: true }); // Create folder structure recursively
      }

      // Write the file
      await instance.fs.writeFile(path, content);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to write file';
      console.error(`Failed to write file at ${path}:`, err);
      throw new Error(`Failed to write file at ${path}: ${errorMessage}`);
    }
  }, [instance]);

  // Added destroy function
  const destroy = useCallback(() => {
    if (instance) {
      instance.teardown();
      setInstance(null);
      setServerUrl(null);
    }
  }, [instance]);

  return { serverUrl, isLoading, error, instance, writeFileSync, destroy };
};