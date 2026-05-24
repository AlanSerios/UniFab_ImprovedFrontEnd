import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage, Center, Html } from "@react-three/drei";
import { STLLoader, OBJLoader, ThreeMFLoader } from "three-stdlib";
import { useLoader } from "@react-three/fiber";
import { Cache } from "three";

const SUPPORTED_EXTENSIONS = [".stl", ".obj", ".3mf"];
const MIME_EXTENSION_MAP = new Map([
  ["model/stl", ".stl"],
  ["model/x.stl-binary", ".stl"],
  ["model/x.stl-ascii", ".stl"],
  ["application/sla", ".stl"],
  ["model/obj", ".obj"],
  ["text/plain", null],
  ["application/vnd.ms-package.3dmanufacturing-3dmodel+xml", ".3mf"],
  ["application/3mf", ".3mf"],
]);

function normalizeExtension(value) {
  if (!value) return null;

  const normalized = String(value).trim().toLowerCase();

  if (!normalized) return null;

  const extension = normalized.startsWith(".") ? normalized : `.${normalized}`;

  return SUPPORTED_EXTENSIONS.includes(extension) ? extension : null;
}

function extensionFromPath(value) {
  if (!value) return null;

  const normalized = String(value).split(/[?#]/)[0];
  const match = normalized.toLowerCase().match(/\.[^.\\/]+$/);

  return normalizeExtension(match?.[0]);
}

function fileNameFromContentDisposition(contentDisposition) {
  if (!contentDisposition) return null;

  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);

  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);

  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  return plainMatch?.[1]?.trim() || null;
}

function extensionFromMimeType(mimeType) {
  if (!mimeType) return null;

  const normalized = String(mimeType).split(";")[0].trim().toLowerCase();
  return MIME_EXTENSION_MAP.get(normalized) || null;
}

function resolveModelExtension({
  explicitExtension,
  file,
  fileName,
  url,
  responseFileName,
  responseMimeType,
}) {
  return (
    normalizeExtension(explicitExtension) ||
    extensionFromPath(file?.name) ||
    extensionFromPath(fileName) ||
    extensionFromPath(url) ||
    extensionFromPath(responseFileName) ||
    extensionFromMimeType(responseMimeType)
  );
}

function CanvasMessage({ children }) {
  return (
    <Html center>
      <div className="rounded-md bg-white/95 px-4 py-2 text-center text-sm font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">
        {children}
      </div>
    </Html>
  );
}

class ModelLoaderErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (typeof this.props.onError === "function") {
      this.props.onError(error);
    }
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
      if (typeof this.props.onReset === "function") {
        this.props.onReset();
      }
    }
  }

  render() {
    if (this.state.error) {
      const message =
        this.state.error?.message ||
        "The browser could not render this model preview.";

      return (
        <CanvasMessage>
          {message}
        </CanvasMessage>
      );
    }

    return this.props.children;
  }
}

function StlModel({ url }) {
  const geometry = useLoader(STLLoader, url);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#475569" roughness={0.5} />
    </mesh>
  );
}

function ObjModel({ url }) {
  const obj = useLoader(OBJLoader, url);
  return <primitive object={obj} />;
}

function ThreeMfModel({ url }) {
  const group = useLoader(ThreeMFLoader, url);
  return <primitive object={group} />;
}

function DynamicModel({ url, extension }) {
  if (extension === ".stl") return <StlModel url={url} />;
  if (extension === ".obj") return <ObjModel url={url} />;
  if (extension === ".3mf") return <ThreeMfModel url={url} />;
  return null;
}

function shouldFetchWithCredentials(url) {
  if (!url || url.startsWith("blob:")) {
    return false;
  }

  if (url.startsWith("/")) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return parsed.origin === window.location.origin || url.includes("/api/v1/files/");
  } catch {
    return false;
  }
}

export function ModelViewer({
  file,
  url,
  fileName,
  extension,
  className = "",
}) {
  const [remoteObjectUrl, setRemoteObjectUrl] = useState(null);
  const [remoteFileName, setRemoteFileName] = useState(null);
  const [remoteMimeType, setRemoteMimeType] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [renderError, setRenderError] = useState("");
  const remoteObjectUrlRef = useRef(null);
  const localObjectUrlRef = useRef(null);
  const requestIdRef = useRef(0);

  const fileIdentity = useMemo(() => {
    if (!file) return "";

    return [file.name, file.size, file.lastModified, file.type].join(":");
  }, [file]);

  const [localObjectUrl, setLocalObjectUrl] = useState(null);

  useEffect(() => {
    if (!file) {
      if (localObjectUrlRef.current) {
        Cache.remove(localObjectUrlRef.current);
        URL.revokeObjectURL(localObjectUrlRef.current);
        localObjectUrlRef.current = null;
      }

      return undefined;
    }

    const objectUrl = URL.createObjectURL(file);
    const previousObjectUrl = localObjectUrlRef.current;
    localObjectUrlRef.current = objectUrl;
    // The object URL is allocated by this effect for the next Three.js loader render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalObjectUrl(objectUrl);

    if (previousObjectUrl) {
      Cache.remove(previousObjectUrl);
      URL.revokeObjectURL(previousObjectUrl);
    }

    return () => {
      if (localObjectUrlRef.current === objectUrl) {
        Cache.remove(objectUrl);
        URL.revokeObjectURL(objectUrl);
        localObjectUrlRef.current = null;
      }
    };
  }, [file, fileIdentity]);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const abortController = new AbortController();

    async function loadRemoteModel() {
      setLoadError("");
      setRenderError("");
      setRemoteFileName(null);
      setRemoteMimeType(null);

      if (file || !url || !shouldFetchWithCredentials(url)) {
        if (remoteObjectUrlRef.current) {
          Cache.remove(remoteObjectUrlRef.current);
          URL.revokeObjectURL(remoteObjectUrlRef.current);
          remoteObjectUrlRef.current = null;
        }
        setRemoteObjectUrl(null);
        return;
      }

      try {
        const response = await fetch(url, {
          credentials: "include",
          signal: abortController.signal,
        });

        if (!response.ok) {
          const message =
            response.status === 410
              ? "This model file is missing from storage. If the database was reset, upload or seed the model again."
              : response.status === 403
                ? "You do not have permission to preview this model file."
                : `Model request failed with status ${response.status}`;
          throw new Error(message);
        }

        const blob = await response.blob();
        const responseMimeType = response.headers.get("Content-Type");

        if (blob.size === 0) {
          throw new Error("The model download was empty.");
        }

        if (responseMimeType?.toLowerCase().includes("application/json")) {
          throw new Error("The model download returned JSON instead of a model file.");
        }

        const objectUrl = URL.createObjectURL(blob);
        const responseFileName = fileNameFromContentDisposition(
          response.headers.get("Content-Disposition"),
        );

        if (requestIdRef.current !== requestId || abortController.signal.aborted) {
          Cache.remove(objectUrl);
          URL.revokeObjectURL(objectUrl);
          return;
        }

        if (remoteObjectUrlRef.current) {
          Cache.remove(remoteObjectUrlRef.current);
          URL.revokeObjectURL(remoteObjectUrlRef.current);
        }

        remoteObjectUrlRef.current = objectUrl;
        setRemoteFileName(responseFileName);
        setRemoteMimeType(responseMimeType);
        setRenderError("");
        setRemoteObjectUrl(objectUrl);
      } catch (error) {
        if (error.name !== "AbortError" && requestIdRef.current === requestId) {
          setLoadError(error.message || "Unable to load model preview.");
        }
      }
    }

    loadRemoteModel();

    return () => {
      abortController.abort();
    };
  }, [file, url]);

  useEffect(() => {
    return () => {
      if (remoteObjectUrlRef.current) {
        Cache.remove(remoteObjectUrlRef.current);
        URL.revokeObjectURL(remoteObjectUrlRef.current);
        remoteObjectUrlRef.current = null;
      }
    };
  }, []);

  const needsCredentialFetch = !file && url && shouldFetchWithCredentials(url);
  const modelUrl =
    (file ? localObjectUrl : null) ||
    remoteObjectUrl ||
    (needsCredentialFetch ? null : url) ||
    null;
  const modelExtension = resolveModelExtension({
    explicitExtension: extension,
    file,
    fileName,
    url,
    responseFileName: remoteFileName,
    responseMimeType: remoteMimeType,
  });

  if (loadError) {
    return (
      <div className={`unifab-model-viewer ${className} flex items-center justify-center rounded-lg border-2 border-dashed border-rose-200 bg-rose-50 p-4 text-center text-sm text-rose-700`}>
        {loadError}
      </div>
    );
  }

  if (renderError) {
    return (
      <div className={`unifab-model-viewer ${className} flex items-center justify-center rounded-lg border-2 border-dashed border-rose-200 bg-rose-50 p-4 text-center text-sm text-rose-700`}>
        {renderError}
      </div>
    );
  }

  if (!modelUrl) {
    return (
      <div className={`unifab-model-viewer ${className} flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500`}>
        {needsCredentialFetch ? "Loading 3D preview..." : "Upload a file to preview"}
      </div>
    );
  }

  if (!modelExtension) {
    return (
       <div className={`unifab-model-viewer ${className} flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center text-slate-500`}>
        3D preview is currently only available for .stl, .obj, and .3mf files. <br/> The model type could not be detected from this file.
      </div>
    )
  }

  return (
    <div className={`unifab-model-viewer ${className} w-full cursor-move overflow-hidden rounded-lg border border-slate-200 bg-slate-100`}>
      <Canvas shadows camera={{ position: [0, 0, 150], fov: 50 }}>
        <ModelLoaderErrorBoundary
          resetKey={`${modelUrl}:${modelExtension}`}
          onReset={() => setRenderError("")}
          onError={(error) => {
            setRenderError(
              error?.message ||
                "The browser could not render this model preview.",
            );
          }}
        >
          <Suspense fallback={<CanvasMessage>Loading 3D preview...</CanvasMessage>}>
            <Stage environment="city" intensity={0.6}>
              <Center>
                <DynamicModel url={modelUrl} extension={modelExtension} />
              </Center>
            </Stage>
          </Suspense>
        </ModelLoaderErrorBoundary>
        <OrbitControls autoRotate autoRotateSpeed={2} makeDefault />
      </Canvas>
    </div>
  );
}
