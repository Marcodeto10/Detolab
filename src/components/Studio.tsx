import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  Image as ImageIcon, 
  X, 
  Sparkles, 
  Layers, 
  Copy,
  User, 
  Layout, 
  ArrowRight,
  Loader2,
  Download,
  RefreshCw,
  Search,
  Wand2,
  Edit3,
  Plus,
  Trash2,
  Bookmark,
  History,
  LogOut,
  FolderPlus,
  Folder as FolderIcon,
  ChevronRight,
  ChevronLeft,
  Move,
  Type,
  Package
} from 'lucide-react';
import { Logo, SparkleIcon } from './Icons';
import { GoogleGenAI } from "@google/genai";
import { TEXT_MODEL, MODEL_ORDER, MODELS, getModelId, supportsSearch, ratiosFor, sizesFor, type ModelType } from '../lib/models';
import { getImageDimensions, nearestSupportedRatio, conformToOriginal, pickBaseImage, type Dimensions } from '../lib/originalFormat';
import * as gallery from '../lib/gallery';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface Folder {
  id: string;
  name: string;
  isDefault?: boolean;
}

interface SavedImage {
  id: string;
  url: string;
  prompt: string;
  folderId?: string;
}

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  type: 'background' | 'face' | 'reference' | 'edit-base' | 'mockup-base' | 'mockup-design' | 'product-base' | 'product-ref' | 'product-logo' | 'bulk-base' | 'extra';
  source?: 'upload' | 'gallery' | 'web';
  tag?: string;
}

type AppMode = 'dashboard' | 'compose' | 'edit' | 'gallery' | 'mockups' | 'improver' | 'product' | 'bulk';

interface Stats {
  totalImages: number;
  totalMockups: number;
  totalProducts: number;
}

const MOCKUP_PROMPT = "Replace the existing content inside the mockup with the uploaded design. The design must completely fill the intended mockup frame or surface area. Accurately match the perspective, scale, lighting, shadows, and surface distortion of the original mockup. Remove the previous artwork and seamlessly integrate the new design so it looks naturally embedded into the mockup structure. Respect the boundaries of the frame or object and ensure the design fits precisely within it.";
const PRODUCT_PROMPT = "Integrate the main product into a professional, high-end commercial setting. Use the provided reference image to guide the style, lighting, material feel, and overall atmosphere. Ensure the product remains the central focus, maintaining its original form and details while blending seamlessly with the environment. If a logo is provided, place it naturally on the product or within the scene in a way that looks authentic and high-quality. The final result should look like a premium advertisement photograph.";

const BASE_PRODUCT_PROMPT = `Use the product image as the exact base object.
Do not redesign, redraw, or modify the product. Preserve its exact shape, color, proportions, materials, and details.

Use the reference image only to guide the scene, including lighting style, environment, camera angle, mood, and overall composition.

Place the product naturally inside a realistic commercial setting inspired by the reference image.

If a logo image is provided, apply that exact logo file to the product.
Do not recreate, reinterpret, or stylize the logo.
Use the logo exactly as provided, keeping its original typography, shape, spacing, and proportions.

The logo should appear clean, sharp, and naturally integrated on the product surface, respecting perspective and lighting.

Important rules:
	•	The product must remain unchanged.
	•	The logo must remain unchanged.
	•	Only the environment, lighting, and composition should follow the reference image.

The final result should look like a high-end commercial product photograph, realistic, premium, and professionally lit.

[PRODUCT IMAGE] = locked object
[LOGO IMAGE] = locked asset
[REFERENCE IMAGE] = style guide`;

export const Studio: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mode, setMode] = useState<AppMode>('dashboard');
  const [userName, setUserName] = useState(() => localStorage.getItem('ai-explorer-user-name') || 'Explorer');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(userName);

  const handleSaveName = () => {
    if (tempName.trim()) {
      setUserName(tempName.trim());
      localStorage.setItem('ai-explorer-user-name', tempName.trim());
      setIsEditingName(false);
    }
  };
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [useBasePrompt, setUseBasePrompt] = useState(true);
  const [isIntegrationPromptOpen, setIsIntegrationPromptOpen] = useState(false);
  const [modePrompts, setModePrompts] = useState<Record<AppMode, string>>({
    dashboard: '',
    compose: '',
    edit: '',
    mockups: MOCKUP_PROMPT,
    product: PRODUCT_PROMPT,
    gallery: '',
    improver: '',
    bulk: ''
  });
  const [modeResults, setModeResults] = useState<Record<AppMode, string | null>>({
    dashboard: null,
    compose: null,
    edit: null,
    mockups: null,
    product: null,
    gallery: null,
    improver: null,
    bulk: null
  });
  const [bulkProgress, setBulkProgress] = useState<{ current: number, total: number } | null>(null);
  const [bulkResults, setBulkResults] = useState<{ id: string, url: string }[]>([]);
  const [stats, setStats] = useState<Stats>(() => {
    const saved = localStorage.getItem('deto-lab-stats');
    return saved ? JSON.parse(saved) : { totalImages: 0, totalMockups: 0, totalProducts: 0 };
  });

  const updateStats = (type: 'image' | 'mockup' | 'product') => {
    setStats(prev => {
      const newStats = { ...prev };
      if (type === 'image') newStats.totalImages += 1;
      if (type === 'mockup') newStats.totalMockups += 1;
      if (type === 'product') newStats.totalProducts += 1;
      localStorage.setItem('deto-lab-stats', JSON.stringify(newStats));
      return newStats;
    });
  };
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationTime, setGenerationTime] = useState(0);
  const timerRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startTimer = () => {
    setGenerationTime(0);
    timerRef.current = setInterval(() => {
      setGenerationTime((prev: number) => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
    stopTimer();
    setError("Generation cancelled by user.");
  };
  const [error, setError] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<string>('ORIGINAL');
  const [imageSize, setImageSize] = useState<string>('2K');
  const [useSearch, setUseSearch] = useState(false);
  const [modelType, setModelType] = useState<ModelType>('pro');
  // El estado real vive en IndexedDB; esto es solo el valor inicial
  // hasta que termina la carga asíncrona.
  const [folders, setFolders] = useState<Folder[]>(gallery.DEFAULT_FOLDERS);
  const [currentFolderId, setCurrentFolderId] = useState<string>('all');
  const [savedImages, setSavedImages] = useState<SavedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const currentImageIndex = savedImages.findIndex(img => img.url === selectedImage);

  const nextImage = useCallback(() => {
    if (currentImageIndex < savedImages.length - 1) {
      setSelectedImage(savedImages[currentImageIndex + 1].url);
    }
  }, [currentImageIndex, savedImages]);

  const prevImage = useCallback(() => {
    if (currentImageIndex > 0) {
      setSelectedImage(savedImages[currentImageIndex - 1].url);
    }
  }, [currentImageIndex, savedImages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedImage) return;
      if (e.key === 'Escape') setSelectedImage(null);
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'ArrowLeft') prevImage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage, nextImage, prevImage]);

  const [storageInfo, setStorageInfo] = useState<gallery.StorageInfo | null>(null);

  const refreshStorageInfo = useCallback(async () => {
    setStorageInfo(await gallery.getStorageInfo());
  }, []);

  useEffect(() => {
    // La galería vive en IndexedDB, en el navegador del usuario.
    // No hay backend ni credenciales: cada persona ve solo lo suyo.
    let alive = true;

    (async () => {
      // Restos de la implementación anterior: ocupaban cuota sin usarse.
      localStorage.removeItem('ai-explorer-gallery');
      localStorage.removeItem('ai-explorer-folders');

      await gallery.requestPersistence();
      const [f, imgs] = await Promise.all([gallery.listFolders(), gallery.listImages()]);
      if (!alive) return;
      setFolders(f);
      setSavedImages(imgs);
      refreshStorageInfo();
    })();

    return () => {
      alive = false;
      gallery.releaseAllUrls();
    };
  }, [refreshStorageInfo]);

  const [urlInput, setUrlInput] = useState('');
  const [showGalleryInResult, setShowGalleryInResult] = useState(false);
  const [isUrlLoading, setIsUrlLoading] = useState(false);

  const createFolder = async (name: string) => {
    try {
      const folder = await gallery.createFolder(name);
      setFolders(prev => [...prev, folder]);
    } catch (err) {
      console.error("No se pudo crear la carpeta:", err);
      setError("No se pudo crear la carpeta.");
    }
  };

  const deleteFolder = async (id: string) => {
    if (folders.find(f => f.id === id)?.isDefault) return;
    setFolders(prev => prev.filter(f => f.id !== id));
    setSavedImages(prev => prev.map(img => img.folderId === id ? { ...img, folderId: 'all' } : img));
    if (currentFolderId === id) setCurrentFolderId('all');

    try {
      await gallery.deleteFolder(id);
    } catch (err) {
      console.error("No se pudo borrar la carpeta:", err);
    }
  };

  const saveToGallery = async (url: string, imagePrompt: string) => {
    let folderId = currentFolderId;
    if (mode === 'mockups') folderId = 'mockups';
    else if (mode === 'product') folderId = 'products';

    if (mode === 'mockups') updateStats('mockup');
    else if (mode === 'product') updateStats('product');
    else updateStats('image');

    try {
      const saved = await gallery.saveImage(url, imagePrompt, folderId);
      setSavedImages(prev => [saved, ...prev]);
      refreshStorageInfo();
    } catch (err: any) {
      console.error("No se pudo guardar en la galería:", err);
      const quota = err?.name === 'QuotaExceededError';
      setError(quota
        ? "No queda espacio en la galería. Borrá imágenes viejas o exportalas antes de seguir."
        : "La imagen se generó pero no se pudo guardar en la galería.");
    }
  };

  const deleteFromGallery = async (id: string) => {
    setSavedImages(prev => prev.filter(img => img.id !== id));
    try {
      await gallery.deleteImage(id);
      refreshStorageInfo();
    } catch (err) {
      console.error("No se pudo borrar la imagen:", err);
    }
  };

  const moveImageToFolder = async (imageId: string, folderId: string) => {
    setSavedImages(prev => prev.map(img => img.id === imageId ? { ...img, folderId } : img));
    try {
      await gallery.moveImage(imageId, folderId);
    } catch (err) {
      console.error("No se pudo mover la imagen:", err);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[], type: UploadedImage['type'], source: UploadedImage['source'] = 'upload', tag?: string) => {
    const newImages = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: URL.createObjectURL(file),
      type,
      source,
      tag
    }));
    
    const singularTypes: UploadedImage['type'][] = ['edit-base', 'mockup-base', 'mockup-design', 'product-base', 'product-ref', 'product-logo', 'reference'];
    
    if (singularTypes.includes(type)) {
      setImages(prev => [...prev.filter(img => img.type !== type), ...newImages]);
    } else {
      setImages(prev => [...prev, ...newImages]);
    }
  }, []);

  const handleModeChange = (newMode: AppMode) => {
    setMode(newMode);
    setError(null);
    setUrlInput('');
    // Reset mode results if needed, or keep them for history
  };

  const handleGalleryDragStart = (e: React.DragEvent, url: string) => {
    e.dataTransfer.setData('text/plain', url);
    e.dataTransfer.setData('text/uri-list', url);
  };

  const processImageUrl = async (url: string, type: UploadedImage['type'], source: UploadedImage['source'] = 'web', tag?: string) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return false;
    
    // Basic URL validation
    if (!trimmedUrl.startsWith('http') && !trimmedUrl.startsWith('data:') && !trimmedUrl.startsWith('blob:')) {
      setError("Please provide a valid image link (starting with http or https).");
      return false;
    }

    setIsUrlLoading(true);
    setError(null);
    
    const isInternal = trimmedUrl.startsWith('blob:') || trimmedUrl.startsWith('data:');
    
    try {
      let response: Response | null = null;
      
      const fetchWithTimeout = async (u: string, options: any = {}) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 8000); // 8s timeout
        try {
          const res = await fetch(u, { ...options, signal: controller.signal });
          clearTimeout(id);
          return res;
        } catch (e) {
          clearTimeout(id);
          throw e;
        }
      };

      if (isInternal) {
        response = await fetch(trimmedUrl);
      } else {
        // Try direct fetch first
        try {
          response = await fetchWithTimeout(trimmedUrl, { mode: 'cors' });
        } catch (e) {
          // CORS fail or timeout
        }

        if (!response || !response.ok) {
          // Try multiple CORS proxies
          const proxies = [
            (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
            (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
            (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
          ];

          for (const getProxyUrl of proxies) {
            try {
              const proxyUrl = getProxyUrl(trimmedUrl);
              const proxyResponse = await fetchWithTimeout(proxyUrl);
              if (proxyResponse.ok) {
                response = proxyResponse;
                break;
              }
            } catch (err) {
              // Next proxy
            }
          }
        }
      }

      if (!response || !response.ok) {
        throw new Error("Failed to fetch image. The site might be blocking access. Try downloading the image and uploading it manually.");
      }

      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) {
        throw new Error("The provided link does not appear to be a valid image file.");
      }

      const file = new File([blob], `${source}-${Date.now()}.jpg`, { type: blob.type });
      const preview = URL.createObjectURL(blob);

      const newImage: UploadedImage = {
        id: Math.random().toString(36).substring(7),
        file,
        preview,
        type,
        source,
        tag
      };

      const singularTypes: UploadedImage['type'][] = ['edit-base', 'mockup-base', 'mockup-design', 'product-base', 'product-ref', 'product-logo', 'reference'];

      if (singularTypes.includes(type)) {
        setImages(prev => [...prev.filter(img => img.type !== type), newImage]);
      } else {
        setImages(prev => [...prev, newImage]);
      }

      if (type === 'edit-base') setMode('edit');
      return true;
    } catch (err: any) {
      console.error("Error processing image URL:", err);
      setError(err.message || "Failed to load image from URL.");
      return false;
    } finally {
      setIsUrlLoading(false);
    }
  };

  const selectGalleryImage = async (url: string, type: UploadedImage['type'] = 'edit-base', tag?: string) => {
    // Gallery images are usually internal blob/data URLs, but onUrlDrop can be external
    const success = await processImageUrl(url, type, url.startsWith('blob:') || url.startsWith('data:') ? 'gallery' : 'web', tag);
    return success;
  };

  const handleImageUrlSubmit = async (url: string, type: UploadedImage['type']) => {
    const success = await processImageUrl(url, type, 'web');
    if (success) {
      setUrlInput('');
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const [isImproving, setIsImproving] = useState(false);

  const improvePrompt = async () => {
    const currentPrompt = modePrompts.improver;
    if (!currentPrompt) {
      setError("Please provide a prompt to improve.");
      return;
    }

    setIsImproving(true);
    setError(null);

    try {
      const apiKey = localStorage.getItem('ai-explorer-manual-key');

      if (!apiKey) throw new Error("No API Key found.");

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: `You are a prompt engineer for Nano Banana Pro (Gemini 3 Pro Image).
This model plans internally and follows structured, declarative instructions. It does NOT
benefit from piles of adjectives or "cinematic" filler — that degrades adherence.

Rewrite the prompt below so that it:
- States the subject and the intended change as a direct instruction, not a description.
- Specifies camera framing, lens feel, and lighting in concrete terms (only where it matters).
- Names materials, finishes and colours explicitly instead of using vague mood words.
- Says what must stay UNCHANGED from any input image.
- Stays under 150 words. Shorter is better if the intent is already unambiguous.

Do not add stylistic flourishes the user did not ask for.
Return ONLY the rewritten prompt, no preamble, no explanations.

Original Prompt: ${currentPrompt}`,
      });

      const improved = response.text;
      setModePrompts(prev => ({ ...prev, improver: improved }));
    } catch (err: any) {
      console.error("Improvement error:", err);
      setError(err.message || "Failed to improve prompt.");
    } finally {
      setIsImproving(false);
    }
  };

  const generateImage = async () => {
    const currentPrompt = modePrompts[mode];
    if (!currentPrompt && images.length === 0) {
      setError("Please provide a prompt or at least one image.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    startTimer();
    abortControllerRef.current = new AbortController();

    try {
      const apiKey = localStorage.getItem('ai-explorer-manual-key');

      if (!apiKey) throw new Error("No API Key found. Please enter one in the access screen.");
      
      const ai = new GoogleGenAI({ apiKey });
      const model = getModelId(modelType);

      // --- Formato ORIGINAL: medimos la foto base antes de generar ---
      let originalDims: Dimensions | null = null;
      let effectiveRatio = aspectRatio;

      if (aspectRatio === 'ORIGINAL') {
        const baseImg = pickBaseImage(images, mode);
        if (baseImg) {
          try {
            originalDims = await getImageDimensions(baseImg.file);
            effectiveRatio = nearestSupportedRatio(originalDims, ratiosFor(modelType));
          } catch {
            effectiveRatio = '1:1';
          }
        } else {
          effectiveRatio = '1:1';
        }
      }

      if (mode === 'bulk') {
        const bulkBases = images.filter(img => img.type === 'bulk-base');
        const refImage = images.find(img => img.type === 'reference');
        const total = bulkBases.length;
        
        setBulkProgress({ current: 0, total });
        setBulkResults([]);

        for (let i = 0; i < total; i++) {
          if (abortControllerRef.current?.signal.aborted) break;
          
          try {
            setBulkProgress({ current: i + 1, total });
            const currentBase = bulkBases[i];

            // En bulk cada base puede tener dimensiones distintas,
            // así que ORIGINAL se resuelve por imagen.
            let itemDims: Dimensions | null = null;
            let itemRatio = effectiveRatio;
            if (aspectRatio === 'ORIGINAL') {
              try {
                itemDims = await getImageDimensions(currentBase.file);
                itemRatio = nearestSupportedRatio(itemDims, ratiosFor(modelType));
              } catch {
                itemRatio = '1:1';
              }
            }

            let finalPrompt = currentPrompt || "Generate an image.";
            const parts: any[] = [];

            // Add reference image first if it exists
            if (refImage) {
              const refBase64 = await fileToBase64(refImage.file);
              parts.push({
                inlineData: {
                  data: refBase64,
                  mimeType: refImage.file.type
                }
              });
              parts.push({ text: "REFERENCE ASSET: This image serves as a reference. It can be a style guide (lighting, mood) OR a specific object/product that needs to be integrated, swapped, or replaced into the base image. Follow the prompt instructions carefully regarding this asset." });
            }

            // Add the base image to modify
            const base64 = await fileToBase64(currentBase.file);
            parts.push({
              inlineData: {
                data: base64,
                mimeType: currentBase.file.type
              }
            });
            parts.push({ text: "BASE IMAGE: This is the primary scene or subject. Modify this image by following the prompt instructions. If a reference asset is provided, you may need to integrate it, swap objects with it, or follow its style as requested." });

            // Add the prompt last
            parts.push({ text: `PROMPT INSTRUCTIONS: ${finalPrompt}` });

            const responsePromise = ai.models.generateContent({
              model,
              contents: { parts },
              config: {
                imageConfig: { aspectRatio: itemRatio, imageSize },
                tools: (useSearch && supportsSearch(modelType)) ? [{ googleSearch: {} }] : undefined
              },
            });

            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Request timed out")), 120000)
            );

            const response: any = await Promise.race([responsePromise, timeoutPromise]);
            
            for (const part of response.candidates[0].content.parts) {
              if (part.inlineData) {
                let imageUrl = `data:image/png;base64,${part.inlineData.data}`;
                if (itemDims) {
                  try { imageUrl = await conformToOriginal(imageUrl, itemDims); } catch {}
                }
                const resultId = Math.random().toString(36).substring(7);
                setBulkResults(prev => [...prev, { id: resultId, url: imageUrl }]);
                await saveToGallery(imageUrl, currentPrompt);
                break;
              }
            }

            // Small delay between requests to avoid rate limits
            if (i < total - 1) {
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          } catch (err: any) {
            console.error(`Error generating image ${i + 1}:`, err);
            // Don't stop the whole process, just log and continue
            setBulkResults(prev => [...prev, { 
              id: `error-${i}`, 
              url: '', 
              error: err.message || "Failed to generate this image." 
            }]);
          }
        }
        setBulkProgress(null);
      } else {
        // Existing single image logic
        let finalPrompt = currentPrompt || "Generate an image.";
        
        if (mode === 'product' && useBasePrompt) {
          finalPrompt = `${BASE_PRODUCT_PROMPT}\n\nAdditional Instructions: ${finalPrompt}`;
        }

        // Las imágenes van primero y la instrucción al final: el modelo
        // pondera mejor las referencias cuando llegan antes del prompt.
        const parts: any[] = [];

        // Filter images based on mode
        let relevantImages = [];
        if (mode === 'edit') {
          relevantImages = images.filter(img => img.type === 'edit-base');
        } else if (mode === 'mockups') {
          relevantImages = images.filter(img => img.type === 'mockup-base' || img.type === 'mockup-design');
        } else if (mode === 'product') {
          relevantImages = images.filter(img => img.type === 'product-base' || img.type === 'product-ref' || img.type === 'product-logo');
        } else {
          relevantImages = images.filter(img => img.type !== 'edit-base' && img.type !== 'mockup-base' && img.type !== 'mockup-design' && img.type !== 'product-base' && img.type !== 'product-ref' && img.type !== 'product-logo');
        }

        for (const img of relevantImages) {
          const base64 = await fileToBase64(img.file);
          parts.push({
            inlineData: {
              data: base64,
              mimeType: img.file.type
            }
          });
          
          if (mode === 'compose') {
            if (img.type === 'background') parts.push({ text: "Use this as the background." });
            if (img.type === 'face') parts.push({ text: "Use this person's face/likeness." });
            if (img.type === 'reference') parts.push({ text: "Use this as a style or composition reference." });
          } else if (mode === 'edit') {
            parts.push({ text: "This is the image to modify. Follow the instructions to edit it." });
          } else if (mode === 'mockups') {
            if (img.type === 'mockup-base') parts.push({ text: "This is the base mockup image." });
            if (img.type === 'mockup-design') parts.push({ text: "This is the design to be integrated into the mockup." });
          } else if (mode === 'product') {
            if (img.type === 'product-base') parts.push({ text: "This is the main product image to be integrated." });
            if (img.type === 'product-ref') parts.push({ text: "Use this image for style, lighting, and material reference." });
            if (img.type === 'product-logo') parts.push({ text: "This is the logo to be integrated onto the product or into the scene." });
          }
        }

        parts.push({ text: `PROMPT INSTRUCTIONS: ${finalPrompt}` });

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Request timed out after 120 seconds. The model is taking too long.")), 120000)
        );

        const responsePromise = ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: effectiveRatio,
              imageSize
            },
            tools: (useSearch && supportsSearch(modelType)) ? [{ googleSearch: {} }] : undefined
          },
        });

        const response: any = await Promise.race([responsePromise, timeoutPromise]);

        let foundImage = false;
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const base64EncodeString = part.inlineData.data;
            let imageUrl = `data:image/png;base64,${base64EncodeString}`;
            if (originalDims) {
              try { imageUrl = await conformToOriginal(imageUrl, originalDims); } catch {}
            }
            setModeResults(prev => ({ ...prev, [mode]: imageUrl }));
            await saveToGallery(imageUrl, currentPrompt);
            foundImage = true;
            break;
          }
        }

        if (!foundImage) {
          setError("The model didn't return an image. It might have returned text instead.");
        }
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      
      // Handle permission errors by prompting for key selection if in Pro mode
      const errorMsg = err.message || "";
      if (errorMsg.includes("PERMISSION_DENIED") || errorMsg.includes("403") || errorMsg.includes("not found")) {
        setError(
          `El modelo "${getModelId(modelType)}" fue rechazado. Suele ser una de tres cosas: ` +
          `la key no tiene billing activo, la key no tiene acceso a ese modelo, o llegaste al límite de cuota.`
        );
      } else {
        setError(err.message || "An unexpected error occurred.");
      }
    } finally {
      setIsGenerating(false);
      stopTimer();
    }
  };

  const downloadImage = () => {
    const currentResult = modeResults[mode];
    if (!currentResult) return;
    const link = document.createElement('a');
    link.href = currentResult;
    link.download = `nano-magic-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="studio-grain min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-white selection:text-black flex overflow-hidden p-0">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-black/80 backdrop-blur-xl border-b border-white/5 z-[60] flex items-center justify-between px-6">
        <Logo className="w-24 h-auto" />
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 text-white/60 hover:text-white transition-colors"
        >
          {isSidebarOpen ? <X className="w-6 h-6" /> : <Layout className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <nav className={cn(
        "w-72 glass-nav flex flex-col h-screen z-50 shrink-0 transition-all duration-500 lg:mr-0",
        "fixed lg:relative inset-y-0 left-0 lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo at Top */}
          <div className="p-6 hidden lg:block">
            <button onClick={() => setMode('dashboard')} className="w-full text-left">
              <Logo className="w-[56%] h-auto" />
            </button>
          </div>

          <div className="h-[1.5px] bg-white/10 mx-6 hidden lg:block" />

          {/* Welcome Header */}
          <div className="p-6 space-y-1">
            <p className="text-[10px] text-white/30 font-bold tracking-[0.2em] uppercase">Studio Session</p>
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  value={tempName} 
                  onChange={(e) => setTempName(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  autoFocus
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-lg font-bold text-white outline-none w-full"
                />
              </div>
            ) : (
              <h2 
                onClick={() => setIsEditingName(true)}
                className="text-2xl font-bold tracking-tight text-white/90 cursor-pointer hover:text-white transition-colors flex items-center gap-2 group"
              >
                {userName}
                <Edit3 className="w-4 h-4 opacity-0 group-hover:opacity-40 transition-opacity" />
              </h2>
            )}
            <p className="text-[10px] text-white/20 font-medium tracking-wide">
              {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>

          <div className="h-[1.5px] bg-white/10 mx-6" />

          <div className="flex-1 p-6 space-y-6 overflow-y-auto no-scrollbar">
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-[#8c8c8c] tracking-[0.2em] block mb-4 uppercase">MAIN MENU</label>
              <div className="space-y-1">
                <NavButton 
                  active={mode === 'dashboard'} 
                  onClick={() => {
                    setMode('dashboard');
                    setIsSidebarOpen(false);
                  }} 
                  icon={<Layout className={cn("w-5 h-5", mode === 'dashboard' && "fill-current")} />} 
                  label="Dashboard" 
                />
                <NavButton 
                  active={mode === 'compose'} 
                  onClick={() => {
                    handleModeChange('compose');
                    setIsSidebarOpen(false);
                  }} 
                  icon={<Layers className={cn("w-5 h-5", mode === 'compose' && "fill-current")} />} 
                  label="Create image" 
                />
                <NavButton 
                  active={mode === 'edit'} 
                  onClick={() => {
                    handleModeChange('edit');
                    setIsSidebarOpen(false);
                  }} 
                  icon={<Edit3 className={cn("w-5 h-5", mode === 'edit' && "fill-current")} />} 
                  label="Edit image" 
                />
                <NavButton 
                  active={mode === 'mockups'} 
                  onClick={() => {
                    handleModeChange('mockups');
                    setIsSidebarOpen(false);
                  }} 
                  icon={<Layout className={cn("w-5 h-5", mode === 'mockups' && "fill-current")} />} 
                  label="Mockups" 
                />
                <NavButton 
                  active={mode === 'product'} 
                  onClick={() => {
                    handleModeChange('product');
                    setIsSidebarOpen(false);
                  }} 
                  icon={<Package className={cn("w-5 h-5", mode === 'product' && "fill-current")} />} 
                  label="Product" 
                />
                <NavButton 
                  active={mode === 'bulk'} 
                  onClick={() => {
                    handleModeChange('bulk');
                    setIsSidebarOpen(false);
                  }} 
                  icon={<Copy className={cn("w-5 h-5", mode === 'bulk' && "fill-current")} />} 
                  label="Bulk" 
                />
                <NavButton 
                  active={mode === 'improver'} 
                  onClick={() => {
                    handleModeChange('improver');
                    setIsSidebarOpen(false);
                  }} 
                  icon={<Type className={cn("w-5 h-5", mode === 'improver' && "fill-current")} />} 
                  label="Prompt magic" 
                />
                <NavButton 
                  active={mode === 'gallery'} 
                  onClick={() => {
                    setMode('gallery');
                    setIsSidebarOpen(false);
                  }} 
                  icon={<History className={cn("w-5 h-5", mode === 'gallery' && "fill-current")} />} 
                  label="My gallery" 
                  badge={savedImages.length > 0 ? savedImages.length.toString() : undefined}
                />

                <button 
                  onClick={downloadImage}
                  disabled={!modeResults[mode]}
                  className={cn(
                    "w-full flex items-center gap-4 px-4 py-3 rounded-full transition-all group text-white/40 hover:text-white hover:bg-white/5",
                    !modeResults[mode] && "hidden"
                  )}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-all text-white/40 group-hover:text-white">
                    <Download className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-medium tracking-tight">Download result</span>
                </button>

                <button 
                  onClick={() => {
                    localStorage.removeItem('ai-explorer-manual-key');
                    localStorage.removeItem('ai-explorer-user-name');
                    window.location.reload();
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-full transition-all group text-white/40 hover:text-white hover:bg-white/5"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center transition-all text-white/40 group-hover:text-white">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-medium tracking-tight">Sign out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-[#141414] mt-16 lg:mt-0">
        {/* Left Sidebar: Controls */}
        <div className={cn(
          "lg:col-span-4 border-b lg:border-b-0 lg:border-r border-white/[0.03] p-6 lg:p-10 space-y-8 lg:space-y-12 overflow-y-auto lg:max-h-screen custom-scrollbar bg-white/[0.01] backdrop-blur-sm",
          mode === 'dashboard' && "hidden"
        )}>
          
          {/* Gallery removed from here */}

          <AnimatePresence mode="wait">
            {mode === 'gallery' && (
              <motion.div 
                key="gallery-sidebar"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <h2 className="text-[#8c8c8c] text-3xl font-bold tracking-tighter mb-8">My Gallery</h2>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase">COLLECTIONS</label>
                  </div>
                  
                  <div className="space-y-2">
                    {folders.map((folder) => (
                      <div key={folder.id} className="group relative">
                        <button 
                          onClick={() => setCurrentFolderId(folder.id)}
                          className={cn(
                            "w-full flex items-center justify-between p-4 rounded-lg transition-all border",
                            currentFolderId === folder.id 
                              ? "bg-white text-black border-white" 
                              : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <FolderIcon className="w-4 h-4" />
                            <span className="text-[11px] font-semibold tracking-widest truncate max-w-[120px]">{folder.name}</span>
                          </div>
                          <span className="text-[10px] font-semibold opacity-40">
                            {savedImages.filter(img => folder.id === 'all' ? true : img.folderId === folder.id).length}
                          </span>
                        </button>
                        {!folder.isDefault && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Delete folder "${folder.name}"? Images will be moved to All Visions.`)) {
                                deleteFolder(folder.id);
                              }
                            }}
                            className="absolute right-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Estado del almacenamiento local */}
                  <div className="pt-4 mt-2 border-t border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">
                        Almacenamiento local
                      </span>
                      {storageInfo && (
                        <span className="text-[9px] text-white/40 font-semibold">
                          {gallery.formatBytes(storageInfo.usedBytes)}
                          {storageInfo.quotaBytes > 0 && ` / ${gallery.formatBytes(storageInfo.quotaBytes)}`}
                        </span>
                      )}
                    </div>

                    {storageInfo && storageInfo.quotaBytes > 0 && (
                      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white/40 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (storageInfo.usedBytes / storageInfo.quotaBytes) * 100)}%` }}
                        />
                      </div>
                    )}

                    <p className="text-[9px] leading-relaxed text-white/25">
                      {storageInfo?.persisted
                        ? 'Guardado en este navegador de forma persistente. No se comparte con nadie.'
                        : 'Guardado en este navegador. Si borrás los datos del sitio, se pierde: exportá lo que quieras conservar.'}
                    </p>

                    <button
                      onClick={async () => {
                        const n = await gallery.exportAll();
                        if (n === 0) setError('No hay imágenes para exportar.');
                      }}
                      disabled={savedImages.length === 0}
                      className="w-full py-2 text-[9px] font-bold tracking-widest uppercase bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg transition-all disabled:opacity-30"
                    >
                      Exportar todo ({savedImages.length})
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {mode === 'improver' && (
              <motion.div 
                key="improver-mode"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h2 className="text-[#8c8c8c] text-3xl font-bold tracking-tighter mb-4">Prompt magic</h2>
                <div className="space-y-4">
                  <label className="text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase">01. Original Prompt</label>
                  <textarea 
                    value={modePrompts.improver}
                    onChange={(e) => setModePrompts(prev => ({ ...prev, improver: e.target.value }))}
                    placeholder="Enter your basic prompt idea here..."
                    className="w-full h-40 p-5 bg-white/[0.03] backdrop-blur-md border border-white/5 rounded-2xl focus:ring-1 focus:ring-white/20 outline-none font-sans text-xs placeholder:text-white/10 transition-all text-white hover:border-white/20"
                  />
                </div>
                
                <button 
                  onClick={improvePrompt}
                  disabled={isImproving || !modePrompts.improver}
                  className="w-full py-4 btn-glass text-[10px] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isImproving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Improving...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Improve Prompt
                    </>
                  )}
                </button>

                {modePrompts.improver && !isImproving && (
                  <div className="space-y-4 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase">Result</label>
                      <button 
                        onClick={() => {
                          setModePrompts(prev => ({ ...prev, compose: modePrompts.improver }));
                          setMode('compose');
                        }}
                        className="text-[9px] font-semibold text-blue-500 hover:text-blue-400 transition-colors"
                      >
                        Use in Creator
                      </button>
                    </div>
                    <div className="p-5 bg-white/[0.03] backdrop-blur-md border border-white/5 rounded-lg text-xs font-sans text-white/80 leading-relaxed">
                      {modePrompts.improver}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {mode === 'bulk' && (
              <motion.div 
                key="bulk-mode"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h2 className="text-[#8c8c8c] text-3xl font-bold tracking-tighter mb-4">Bulk</h2>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Layers className="w-4 h-4 text-white/40" />
                      <label className="text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase">01. Bulk Images (20+ allowed)</label>
                    </div>
                    {images.filter(img => img.type === 'bulk-base').length > 0 && (
                      <button 
                        onClick={() => setImages(prev => prev.filter(img => img.type !== 'bulk-base'))}
                        className="text-[9px] font-bold tracking-widest text-red-500/60 hover:text-red-500 uppercase transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="space-y-4">
                    <DropZone 
                      label="Drop multiple images" 
                      icon={<Copy className="w-4 h-4" />} 
                      onDrop={(files) => onDrop(files, 'bulk-base', 'upload', 'Bulk')} 
                      onUrlDrop={(url) => selectGalleryImage(url, 'bulk-base', 'Bulk')}
                      multiple
                    />
                    
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <Sparkles className="w-4 h-4 text-white/40" />
                        <label className="text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase">02. Style Reference (Optional)</label>
                      </div>
                      <DropZone 
                        label="Drop reference image" 
                        icon={null} 
                        onDrop={(files) => onDrop(files, 'reference', 'upload', 'Ref')} 
                        onUrlDrop={(url) => selectGalleryImage(url, 'reference', 'Ref')}
                      />
                    </div>
                  </div>

                  {images.filter(img => img.type === 'bulk-base' || img.type === 'reference').length > 0 && (
                    <div className="grid grid-cols-4 gap-2 pt-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                      {images.filter(img => img.type === 'bulk-base' || img.type === 'reference').map((img) => (
                        <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border border-white/10">
                          <img src={img.preview} alt="upload" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className={cn(
                            "absolute top-1 right-1 w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)] z-10",
                            img.type === 'reference' ? "bg-blue-500" : "bg-emerald-500"
                          )} />
                          <button 
                            onClick={() => removeImage(img.id)}
                            className="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase">03. Shared Prompt</label>
                  <textarea 
                    value={modePrompts.bulk}
                    onChange={(e) => setModePrompts(prev => ({ ...prev, bulk: e.target.value }))}
                    placeholder="Enter the prompt to apply to all images..."
                    className="w-full h-32 p-5 bg-white/[0.03] backdrop-blur-md border border-white/5 rounded-lg focus:ring-1 focus:ring-white/20 outline-none font-sans text-xs placeholder:text-white/10 transition-all text-white hover:border-white/20"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Engine</label>
                    <select 
                      value={modelType}
                      onChange={async (e) => {
                        const newType = e.target.value as ModelType;
                        setModelType(newType);
                        // Si el modelo nuevo no soporta el ratio/size actual, volvemos al default.
                        if (!ratiosFor(newType).includes(aspectRatio)) setAspectRatio('ORIGINAL');
                        if (!sizesFor(newType).includes(imageSize)) setImageSize('2K');
                      }}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {MODEL_ORDER.map(m => <option key={m} value={m} className="bg-zinc-900">{MODELS[m].label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Ratio</label>
                    <select 
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value as any)}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {ratiosFor(modelType).map(r => <option key={r} value={r} className="bg-zinc-900">{r === 'ORIGINAL' ? 'ORIGINAL FOTO' : r}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Size</label>
                    <select 
                      value={imageSize}
                      onChange={(e) => setImageSize(e.target.value as any)}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {sizesFor(modelType).map(sz => <option key={sz} value={sz} className="bg-zinc-900">{sz}</option>)}
                    </select>
                  </div>
                </div>

                <button 
                  onClick={generateImage}
                  disabled={isGenerating || images.filter(img => img.type === 'bulk-base').length === 0}
                  className="w-full py-4 btn-magic transition-all flex items-center justify-center gap-3 group disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="font-semibold text-[10px]">Processing Bulk...</span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-[10px]">Start Bulk Magic</span>
                      <Wand2 className="w-3 h-3" />
                    </>
                  )}
                </button>
              </motion.div>
            )}

            {mode === 'compose' && (
              <motion.div 
                key="compose-mode"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h2 className="text-[#8c8c8c] text-3xl font-bold tracking-tighter mb-4">Creator</h2>
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <ImageIcon className="w-4 h-4 text-white/40" />
                    <label className="text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase">01. Visual Assets (Optional)</label>
                  </div>
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <DropZone 
                        label="Drop an image" 
                        icon={null} 
                        onDrop={(files) => onDrop(files, 'reference')} 
                        onUrlDrop={(url) => selectGalleryImage(url, 'reference')}
                      />
                      <div className="relative">
                        <input 
                          type="text"
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleImageUrlSubmit(urlInput, 'reference')}
                          placeholder="Or paste an image link here..."
                          className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-3 pr-16 text-[10px] outline-none focus:ring-1 focus:ring-white/20 transition-all text-white font-sans"
                        />
                        {urlInput && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            {!isUrlLoading && (
                              <button 
                                onClick={() => setUrlInput('')}
                                className="p-1.5 text-white/20 hover:text-white transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                            <button 
                              onClick={() => handleImageUrlSubmit(urlInput, 'reference')}
                              disabled={isUrlLoading}
                              className="p-1.5 bg-white text-black rounded-md hover:bg-white/90 transition-all disabled:opacity-50"
                            >
                              {isUrlLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
        <div className="flex flex-wrap gap-4">
          <DropZone 
            label="Background" 
            icon={null} 
            onDrop={(files) => onDrop(files, 'background')} 
            onUrlDrop={(url) => selectGalleryImage(url, 'background', 'Background')}
            hideSubtext
            minimal
          />
          <DropZone 
            label="Subject" 
            icon={null} 
            onDrop={(files) => onDrop(files, 'face')} 
            onUrlDrop={(url) => selectGalleryImage(url, 'face', 'Subject')}
            hideSubtext
            minimal
          />
          <DropZone 
            label="Reference" 
            icon={null} 
            onDrop={(files) => onDrop(files, 'reference')} 
            onUrlDrop={(url) => selectGalleryImage(url, 'reference', 'Reference')}
            hideSubtext
            minimal
          />
        </div>
                  </div>

                  {(images.filter(img => img.type !== 'edit-base').length > 0 || isUrlLoading) && (
                    <div className="grid grid-cols-2 gap-4 pt-4">
                      {images.filter(img => img.type !== 'edit-base').map((img) => (
                        <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border border-white/10">
                          <img src={img.preview} alt="upload" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded border border-white/10 text-[8px] font-bold tracking-widest text-white/80 uppercase">
                            {img.tag || (img.source === 'gallery' ? 'Gallery' : (img.source === 'web' ? 'WEB' : (img.type === 'face' ? 'Subject' : (img.type === 'background' ? 'Background' : 'Reference'))))}
                          </div>
                          <button 
                            onClick={() => removeImage(img.id)}
                            className="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-5 h-5 text-white" />
                          </button>
                        </div>
                      ))}
                      {isUrlLoading && (
                        <div className="aspect-square rounded-lg border border-white/10 bg-white/5 flex items-center justify-center animate-pulse">
                          <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase">02. Composition Prompt</label>
                  <textarea 
                    value={modePrompts[mode]}
                    onChange={(e) => setModePrompts(prev => ({ ...prev, [mode]: e.target.value }))}
                    placeholder="How should these elements interact?"
                    className="w-full h-28 p-5 bg-white/[0.03] backdrop-blur-md border border-white/5 rounded-lg focus:ring-1 focus:ring-white/20 outline-none font-sans text-xs placeholder:text-white/10 transition-all text-white hover:border-white/20"
                  />
                </div>

                {/* Controls moved here */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Engine</label>
                    <select 
                      value={modelType}
                      onChange={async (e) => {
                        const newType = e.target.value as ModelType;
                        setModelType(newType);
                        // Si el modelo nuevo no soporta el ratio/size actual, volvemos al default.
                        if (!ratiosFor(newType).includes(aspectRatio)) setAspectRatio('ORIGINAL');
                        if (!sizesFor(newType).includes(imageSize)) setImageSize('2K');
                      }}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {MODEL_ORDER.map(m => <option key={m} value={m} className="bg-zinc-900">{MODELS[m].label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Ratio</label>
                    <select 
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value as any)}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {ratiosFor(modelType).map(r => <option key={r} value={r} className="bg-zinc-900">{r === 'ORIGINAL' ? 'ORIGINAL FOTO' : r}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Size</label>
                    <select 
                      value={imageSize}
                      onChange={(e) => setImageSize(e.target.value as any)}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {sizesFor(modelType).map(sz => <option key={sz} value={sz} className="bg-zinc-900">{sz}</option>)}
                    </select>
                  </div>
                </div>

                <button 
                  onClick={generateImage}
                  disabled={isGenerating}
                  className="w-full py-4 btn-magic transition-all flex items-center justify-center gap-3 group disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="font-semibold text-[10px]">Manifesting...</span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-[10px]">Make magic</span>
                      <Wand2 className="w-3 h-3" />
                    </>
                  )}
                </button>
              </motion.div>
            )}

            {mode === 'mockups' && (
              <motion.div 
                key="mockups-mode"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h2 className="text-[#8c8c8c] text-3xl font-bold tracking-tighter mb-4">Mockups</h2>
                <div className="space-y-6">
                  <label className="text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase">01. Mockup Assets</label>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-3">
                      <DropZone 
                        label="Mockup Base Image" 
                        icon={<ImageIcon className="w-4 h-4" />} 
                        onDrop={(files) => onDrop(files, 'mockup-base')} 
                        onUrlDrop={(url) => selectGalleryImage(url, 'mockup-base', 'Mockup')}
                      />
                    </div>
                    <div className="space-y-3">
                      <DropZone 
                        label="Design to Integrate" 
                        icon={<Layers className="w-4 h-4" />} 
                        onDrop={(files) => onDrop(files, 'mockup-design')} 
                        onUrlDrop={(url) => selectGalleryImage(url, 'mockup-design', 'Design')}
                      />
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20">
                      <Search className="w-3 h-3" />
                    </div>
                    <input 
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleImageUrlSubmit(urlInput, 'mockup-base')}
                      placeholder="Paste an image link here..."
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-3 pl-9 pr-10 text-[10px] outline-none focus:ring-1 focus:ring-white/20 transition-all text-white font-sans"
                    />
                    {isUrlLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-3 h-3 animate-spin text-white/40" />
                      </div>
                    )}
                  </div>

                  {(images.filter(img => img.type === 'mockup-base' || img.type === 'mockup-design').length > 0 || isUrlLoading) && (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      {images.filter(img => img.type === 'mockup-base' || img.type === 'mockup-design').map((img) => (
                        <div key={img.id} className="relative group aspect-video rounded-lg overflow-hidden border border-white/10">
                          <img src={img.preview} alt="upload" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10 text-[8px] font-bold tracking-widest text-white/80 uppercase">
                            {img.tag || (img.source === 'gallery' ? 'Gallery' : (img.source === 'web' ? 'WEB' : (img.type === 'mockup-base' ? 'Mockup' : 'Design')))}
                          </div>
                          <button 
                            onClick={() => removeImage(img.id)}
                            className="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-5 h-5 text-white" />
                          </button>
                        </div>
                      ))}
                      {isUrlLoading && (
                        <div className="aspect-video rounded-lg border border-white/10 bg-white/5 flex items-center justify-center animate-pulse">
                          <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase">02. Integration Prompt</label>
                  <textarea 
                    value={modePrompts[mode]}
                    onChange={(e) => setModePrompts(prev => ({ ...prev, [mode]: e.target.value }))}
                    placeholder="Describe how the design should be integrated..."
                    className="w-full h-40 p-5 bg-white/[0.03] backdrop-blur-md border border-white/5 rounded-lg focus:ring-1 focus:ring-white/20 outline-none font-sans text-xs placeholder:text-white/10 transition-all text-white hover:border-white/20"
                  />
                </div>

                {/* Controls moved here */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Engine</label>
                    <select 
                      value={modelType}
                      onChange={async (e) => {
                        const newType = e.target.value as ModelType;
                        setModelType(newType);
                        // Si el modelo nuevo no soporta el ratio/size actual, volvemos al default.
                        if (!ratiosFor(newType).includes(aspectRatio)) setAspectRatio('ORIGINAL');
                        if (!sizesFor(newType).includes(imageSize)) setImageSize('2K');
                      }}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {MODEL_ORDER.map(m => <option key={m} value={m} className="bg-zinc-900">{MODELS[m].label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Ratio</label>
                    <select 
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value as any)}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {ratiosFor(modelType).map(r => <option key={r} value={r} className="bg-zinc-900">{r === 'ORIGINAL' ? 'ORIGINAL FOTO' : r}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Size</label>
                    <select 
                      value={imageSize}
                      onChange={(e) => setImageSize(e.target.value as any)}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {sizesFor(modelType).map(sz => <option key={sz} value={sz} className="bg-zinc-900">{sz}</option>)}
                    </select>
                  </div>
                </div>

                <button 
                  onClick={generateImage}
                  disabled={isGenerating}
                  className="w-full py-4 btn-magic transition-all flex items-center justify-center gap-3 group disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="font-semibold text-[10px]">Manifesting...</span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-[10px]">Make magic</span>
                      <Wand2 className="w-3 h-3" />
                    </>
                  )}
                </button>
              </motion.div>
            )}

            {mode === 'product' && (
              <motion.div 
                key="product-mode"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h2 className="text-[#8c8c8c] text-3xl font-bold tracking-tighter mb-4">Product</h2>
                <div className="space-y-6">
                  <label className="text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase">01. Product Assets</label>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-3">
                      <DropZone 
                        label="Main Product" 
                        icon={<Package className="w-4 h-4" />} 
                        onDrop={(files) => onDrop(files, 'product-base', 'upload', 'Product')} 
                        onUrlDrop={(url) => selectGalleryImage(url, 'product-base', 'Product')}
                      />
                    </div>
                    <div className="space-y-3">
                      <DropZone 
                        label="Reference Style" 
                        icon={<Sparkles className="w-4 h-4" />} 
                        onDrop={(files) => onDrop(files, 'product-ref', 'upload', 'Ref')} 
                        onUrlDrop={(url) => selectGalleryImage(url, 'product-ref', 'Ref')}
                      />
                    </div>
                    <div className="space-y-3">
                      <DropZone 
                        label="Logo Asset" 
                        icon={<Type className="w-4 h-4" />} 
                        onDrop={(files) => onDrop(files, 'product-logo', 'upload', 'Logo')} 
                        onUrlDrop={(url) => selectGalleryImage(url, 'product-logo', 'Logo')}
                      />
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20">
                      <Search className="w-3 h-3" />
                    </div>
                    <input 
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleImageUrlSubmit(urlInput, 'product-base')}
                      placeholder="Paste an image link here..."
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-3 pl-9 pr-10 text-[10px] outline-none focus:ring-1 focus:ring-white/20 transition-all text-white font-sans"
                    />
                    {isUrlLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-3 h-3 animate-spin text-white/40" />
                      </div>
                    )}
                  </div>

                  {(images.filter(img => img.type === 'product-base' || img.type === 'product-ref' || img.type === 'product-logo').length > 0 || isUrlLoading) && (
                    <div className="grid grid-cols-3 gap-3 pt-2">
                      {images.filter(img => img.type === 'product-base' || img.type === 'product-ref' || img.type === 'product-logo').map((img) => (
                        <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border border-white/10">
                          <img src={img.preview} alt="upload" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] z-10" />
                          <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded border border-white/10 text-[7px] font-bold tracking-widest text-white/80 uppercase">
                            {img.tag || (img.source === 'gallery' ? 'Gallery' : (img.source === 'web' ? 'WEB' : (img.type === 'product-base' ? 'Product' : img.type === 'product-ref' ? 'Ref' : 'Logo')))}
                          </div>
                          <button 
                            onClick={() => removeImage(img.id)}
                            className="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-5 h-5 text-white" />
                          </button>
                        </div>
                      ))}
                      {isUrlLoading && (
                        <div className="aspect-square rounded-lg border border-white/10 bg-white/5 flex items-center justify-center animate-pulse">
                          <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <button 
                    onClick={() => setIsIntegrationPromptOpen(!isIntegrationPromptOpen)}
                    className="w-full flex items-center justify-between text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase hover:text-white transition-colors"
                  >
                    <span>02. Integration Prompt</span>
                    <ChevronRight className={cn("w-4 h-4 transition-transform", isIntegrationPromptOpen && "rotate-90")} />
                  </button>
                  
                  <AnimatePresence>
                    {isIntegrationPromptOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <textarea 
                          value={modePrompts[mode]}
                          onChange={(e) => setModePrompts(prev => ({ ...prev, [mode]: e.target.value }))}
                          placeholder="Describe how the product should be integrated..."
                          className="w-full h-40 p-5 bg-white/[0.03] backdrop-blur-md border border-white/5 rounded-lg focus:ring-1 focus:ring-white/20 outline-none font-sans text-xs placeholder:text-white/10 transition-all text-white hover:border-white/20"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Controls moved here */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Engine</label>
                    <select 
                      value={modelType}
                      onChange={async (e) => {
                        const newType = e.target.value as ModelType;
                        setModelType(newType);
                        // Si el modelo nuevo no soporta el ratio/size actual, volvemos al default.
                        if (!ratiosFor(newType).includes(aspectRatio)) setAspectRatio('ORIGINAL');
                        if (!sizesFor(newType).includes(imageSize)) setImageSize('2K');
                      }}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {MODEL_ORDER.map(m => <option key={m} value={m} className="bg-zinc-900">{MODELS[m].label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Ratio</label>
                    <select 
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value as any)}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {ratiosFor(modelType).map(r => <option key={r} value={r} className="bg-zinc-900">{r === 'ORIGINAL' ? 'ORIGINAL FOTO' : r}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Size</label>
                    <select 
                      value={imageSize}
                      onChange={(e) => setImageSize(e.target.value as any)}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {sizesFor(modelType).map(sz => <option key={sz} value={sz} className="bg-zinc-900">{sz}</option>)}
                    </select>
                  </div>
                </div>

                <button 
                  onClick={generateImage}
                  disabled={isGenerating}
                  className="w-full py-4 btn-magic transition-all flex items-center justify-center gap-3 group disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="font-semibold text-[10px]">Manifesting...</span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-[10px]">Make magic</span>
                      <Wand2 className="w-3 h-3" />
                    </>
                  )}
                </button>

                {/* Prompt Base Toggle */}
                <div className="pt-4 border-t border-white/5">
                  <button 
                    onClick={() => setUseBasePrompt(!useBasePrompt)}
                    className={cn(
                      "w-full p-4 rounded-lg border flex items-center justify-between transition-all group backdrop-blur-md",
                      useBasePrompt ? "bg-white/5 border-white/20 text-white" : "bg-white/[0.02] border-white/5 text-white/30 hover:bg-white/5"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Sparkles className={cn("w-4 h-4", useBasePrompt ? "text-blue-400" : "text-white/20")} />
                      <span className="text-[10px] font-bold tracking-widest uppercase">Prompt base</span>
                    </div>
                    <div className={cn(
                      "w-8 h-4 rounded-full relative transition-colors border border-white/10",
                      useBasePrompt ? "bg-blue-500/20 border-blue-500/30" : "bg-white/5"
                    )}>
                      <div className={cn(
                        "absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all",
                        useBasePrompt ? "right-1 bg-blue-400" : "left-1 bg-white/20"
                      )} />
                    </div>
                  </button>
                  {useBasePrompt && (
                    <p className="mt-2 px-4 text-[8px] text-white/20 font-medium leading-relaxed italic">
                      "Use the product image as the exact base object. Do not redesign, redraw, or modify the product..."
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {mode === 'edit' && (
              <motion.div 
                key="edit-mode"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h2 className="text-[#8c8c8c] text-3xl font-bold tracking-tighter mb-4">Editor</h2>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase">01. Image to edit</label>
                  </div>

                  <div className="space-y-3">
                    <DropZone 
                      label="Upload Image to Edit" 
                      icon={<ImageIcon className="w-4 h-4" />} 
                      onDrop={(files) => onDrop(files, 'edit-base')} 
                      onUrlDrop={(url) => selectGalleryImage(url, 'edit-base')}
                    />
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20">
                        <Search className="w-3 h-3" />
                      </div>
                      <input 
                        type="text"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleImageUrlSubmit(urlInput, 'edit-base')}
                        placeholder="Paste an image link here..."
                        className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-3 pl-9 pr-10 text-[10px] outline-none focus:ring-1 focus:ring-white/20 transition-all text-white font-sans"
                      />
                      {isUrlLoading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-3 h-3 animate-spin text-white/40" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {(images.find(img => img.type === 'edit-base') || isUrlLoading) && (
                    <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 group">
                      {isUrlLoading ? (
                        <div className="w-full h-full bg-white/5 flex items-center justify-center animate-pulse">
                          <Loader2 className="w-8 h-8 text-white/20 animate-spin" />
                        </div>
                      ) : (
                        <>
                          <img 
                            src={images.find(img => img.type === 'edit-base')?.preview} 
                            alt="base" 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10 text-[8px] font-bold tracking-widest text-white/80 uppercase">
                            {images.find(img => img.type === 'edit-base')?.source === 'gallery' ? 'Gallery' : (images.find(img => img.type === 'edit-base')?.source === 'web' ? 'WEB' : 'Base')}
                          </div>
                          <button 
                            onClick={() => removeImage(images.find(img => img.type === 'edit-base')!.id)}
                            className="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-6 h-6 text-white" />
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  <div className="pt-4 border-t border-white/5 space-y-4">
                    <label className="text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase">02. Extra Assets</label>
                    <DropZone 
                      label="Drop an image" 
                      icon={<Plus className="w-4 h-4" />} 
                      onDrop={(files) => onDrop(files, 'extra', 'upload', 'Extra')} 
                      onUrlDrop={(url) => selectGalleryImage(url, 'extra', 'Extra')}
                      multiple
                    />
                    
                    {images.filter(img => img.type === 'extra').length > 0 && (
                      <div className="grid grid-cols-3 gap-3">
                        {images.filter(img => img.type === 'extra').map((img) => (
                          <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden border border-white/10">
                            <img src={img.preview} alt="extra" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded border border-white/10 text-[7px] font-bold tracking-widest text-white/80 uppercase">
                              Extra
                            </div>
                            <button 
                              onClick={() => removeImage(img.id)}
                              className="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-4 h-4 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-semibold tracking-widest text-[#8c8c8c] uppercase">03. Edit Instructions</label>
                  <textarea 
                    value={modePrompts[mode]}
                    onChange={(e) => setModePrompts(prev => ({ ...prev, [mode]: e.target.value }))}
                    placeholder="e.g., 'Change the sky to a sunset', 'Add sunglasses to the person'..."
                    className="w-full h-28 p-5 bg-white/[0.03] backdrop-blur-md border border-white/5 rounded-lg focus:ring-1 focus:ring-white/20 outline-none font-sans text-xs placeholder:text-white/10 transition-all text-white hover:border-white/20"
                  />
                </div>

                {/* Controls moved here */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Engine</label>
                    <select 
                      value={modelType}
                      onChange={async (e) => {
                        const newType = e.target.value as ModelType;
                        setModelType(newType);
                        // Si el modelo nuevo no soporta el ratio/size actual, volvemos al default.
                        if (!ratiosFor(newType).includes(aspectRatio)) setAspectRatio('ORIGINAL');
                        if (!sizesFor(newType).includes(imageSize)) setImageSize('2K');
                      }}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {MODEL_ORDER.map(m => <option key={m} value={m} className="bg-zinc-900">{MODELS[m].label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Ratio</label>
                    <select 
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value as any)}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {ratiosFor(modelType).map(r => <option key={r} value={r} className="bg-zinc-900">{r === 'ORIGINAL' ? 'ORIGINAL FOTO' : r}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-bold tracking-widest text-[#8c8c8c] uppercase">Size</label>
                    <select 
                      value={imageSize}
                      onChange={(e) => setImageSize(e.target.value as any)}
                      className="w-full bg-white/[0.03] border border-white/5 rounded-lg p-2 text-[9px] outline-none focus:ring-1 focus:ring-white/20 font-semibold text-white appearance-none"
                    >
                      {sizesFor(modelType).map(sz => <option key={sz} value={sz} className="bg-zinc-900">{sz}</option>)}
                    </select>
                  </div>
                </div>

                <button 
                  onClick={generateImage}
                  disabled={isGenerating}
                  className="w-full py-4 btn-magic transition-all flex items-center justify-center gap-3 group disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="font-semibold text-[10px]">Manifesting...</span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-[10px]">Make magic</span>
                      <Wand2 className="w-3 h-3" />
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[10px] font-semibold tracking-wider text-center"
            >
              {error}
            </motion.div>
          )}
        </div>

        <div className={cn(
          "bg-[#141414] flex flex-col relative overflow-hidden",
          mode === 'dashboard' ? "lg:col-span-12" : "lg:col-span-8"
        )}>
          {/* Top Gallery Section (Inside Result Area) */}
          {savedImages.length > 0 && mode !== 'gallery' && mode !== 'dashboard' && (
            <div className="w-full border-b border-white/[0.03] bg-[#141414]">
              <div className="max-w-3xl mx-auto p-4 lg:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[#8c8c8c] text-[10px] font-semibold tracking-widest uppercase block">Gallery</h3>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-[8px] font-bold text-white/30 border border-white/5">
                      {savedImages.length}
                    </span>
                  </div>
                  <button 
                    onClick={() => setShowGalleryInResult(true)}
                    className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-bold tracking-widest uppercase hover:bg-white/10 transition-all"
                  >
                    VIEW ALL
                  </button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar custom-scrollbar">
                  {savedImages.slice(0, 15).map((img) => (
                    <button 
                      key={img.id}
                      draggable
                      onDragStart={(e) => handleGalleryDragStart(e, img.url)}
                      onClick={() => {
                        if (mode === 'edit') selectGalleryImage(img.url, 'edit-base');
                        else if (mode === 'mockups') selectGalleryImage(img.url, 'mockup-base');
                        else if (mode === 'product') selectGalleryImage(img.url, 'product-base');
                        else if (mode === 'compose') selectGalleryImage(img.url, 'background');
                      }}
                      className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-white/10 hover:border-white/40 transition-all hover:scale-105 active:scale-95 backdrop-blur-sm bg-white/[0.03] group relative"
                    >
                      <img src={img.url} alt="gallery" className="w-full h-full object-cover pointer-events-none" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className={cn(
            "flex-1 flex flex-col items-center justify-center relative",
            mode === 'dashboard' ? "p-4 lg:p-8" : "p-6 lg:p-10"
          )}>
            <AnimatePresence>
            {selectedImage && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedImage(null)}
                className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-8 lg:p-20 cursor-zoom-out"
              >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="relative max-w-full max-h-full flex items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  {currentImageIndex > 0 && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); prevImage(); }}
                      className="absolute -left-16 lg:-left-24 p-4 text-white/40 hover:text-white transition-colors hover:bg-white/5 rounded-full"
                    >
                      <ChevronLeft className="w-10 h-10" />
                    </button>
                  )}

                  <img src={selectedImage} alt="Expanded" className="max-w-full max-h-[85vh] rounded-lg shadow-2xl border border-white/10" referrerPolicy="no-referrer" />

                  {currentImageIndex < savedImages.length - 1 && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); nextImage(); }}
                      className="absolute -right-16 lg:-right-24 p-4 text-white/40 hover:text-white transition-colors hover:bg-white/5 rounded-full"
                    >
                      <ChevronRight className="w-10 h-10" />
                    </button>
                  )}

                  <button 
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-12 right-0 text-white/40 hover:text-white transition-colors"
                  >
                    <X className="w-8 h-8" />
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {mode === 'dashboard' ? (
              <motion.div
                key="dashboard-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="w-full flex-1 flex flex-col space-y-6 overflow-y-auto no-scrollbar custom-scrollbar"
              >
                {/* Section Grid */}
                <div className="space-y-4 pb-8">
                  <div>
                    <h2 className="font-display text-4xl lg:text-5xl tracking-tight leading-none text-white/90">Creative Studio</h2>
                    <p className="text-xs text-white/40 mt-2">Select a workspace to begin your next masterpiece.</p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-12 gap-4">
                    <DashboardCard
                      title="Creator"
                      description="Generate high-fidelity visuals from text prompts."
                      image="https://i.pinimg.com/736x/d1/2e/8e/d12e8e6856ef91f99b389648ae910e80.jpg"
                      onClick={() => setMode('compose')}
                      className={cn(SECTION_CARD_SIZE, "md:col-span-2 lg:col-span-3")}
                    />
                    <DashboardCard
                      title="Mockups"
                      description="Place designs into realistic environments."
                      image="https://i.pinimg.com/1200x/f0/e9/a1/f0e9a10b372f4ba24dad94217636fb26.jpg"
                      onClick={() => setMode('mockups')}
                      className={cn(SECTION_CARD_SIZE, "md:col-span-2 lg:col-span-3")}
                    />
                    <DashboardCard
                      title="Product"
                      description="Create professional commercial photography."
                      image="https://i.pinimg.com/736x/ab/0e/1e/ab0e1efcad96fcb933ea954784b87a4b.jpg"
                      onClick={() => setMode('product')}
                      className={cn(SECTION_CARD_SIZE, "md:col-span-2 lg:col-span-3")}
                    />
                    <DashboardCard
                      title="Editor"
                      description="Modify existing images with AI precision."
                      image="https://i.pinimg.com/736x/4f/a3/93/4fa39380edb038dd930f6bbccbae6cab.jpg"
                      onClick={() => setMode('edit')}
                      className={cn(SECTION_CARD_SIZE, "md:col-span-2 lg:col-span-3")}
                    />
                    <DashboardCard
                      title="Bulk"
                      description="Process multiple images with the same prompt."
                      image="https://i.pinimg.com/1200x/34/69/9e/34699eca0b59961a9490f5279181afe4.jpg"
                      onClick={() => setMode('bulk')}
                      className={cn(SECTION_CARD_SIZE, "md:col-span-2 lg:col-span-4")}
                    />
                    <DashboardCard
                      title="Magic"
                      description="Optimize and expand your prompts."
                      image="https://i.pinimg.com/736x/0c/57/58/0c5758d9398158b51a46d096278f2b87.jpg"
                      onClick={() => setMode('improver')}
                      className={cn(SECTION_CARD_SIZE, "md:col-span-2 lg:col-span-4")}
                    />
                    <DashboardCard
                      title="Gallery"
                      description="Browse your collection of visions."
                      image="https://i.pinimg.com/1200x/5c/85/8e/5c858e29b3be3e26b63a014e5d4664e0.jpg"
                      onClick={() => setMode('gallery')}
                      className={cn(SECTION_CARD_SIZE, "col-span-2 md:col-span-6 lg:col-span-4")}
                    />
                  </div>
                </div>

                {/* Gallery Preview Section */}
                <div className="space-y-4 pb-8">
                  <div>
                    <h2 className="font-display text-4xl lg:text-5xl tracking-tight leading-none text-white/90">My gallery</h2>
                    <p className="text-xs text-white/40 mt-2">Browse your collection of visions.</p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 pb-8">
                    {savedImages.slice(0, 12).map((img, idx) => (
                      <DashboardCard 
                        key={img.id}
                        title=""
                        description={img.prompt}
                        image={img.url}
                        isGallery
                        onUse={() => {
                          setMode('compose');
                          selectGalleryImage(img.url, 'background');
                        }}
                        onDownload={() => {
                          const link = document.createElement('a');
                          link.href = img.url;
                          link.download = `vision-${img.id}.png`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        onClick={() => {
                          setSelectedImage(img.url);
                        }}
                      />
                    ))}
                    {savedImages.length === 0 && (
                      <div className="col-span-full h-40 flex flex-col items-center justify-center text-white/5 border border-white/5 rounded-xl">
                        <ImageIcon className="w-8 h-8 mb-2 opacity-20" />
                        <p className="text-[10px] font-bold tracking-widest uppercase opacity-20">No visions yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : mode === 'gallery' ? (
              <motion.div 
                key="gallery-view"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute inset-0 z-40 bg-[#0a0a0a] p-8 lg:p-12 overflow-hidden flex flex-col"
              >
                <div className="w-full h-full flex flex-col space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/40 tracking-widest uppercase">
                        {folders.find(f => f.id === currentFolderId)?.name || 'Collection'} — {savedImages.filter(img => currentFolderId === 'all' ? true : img.folderId === currentFolderId).length} items
                      </span>
                    </div>
                    <button 
                      onClick={() => {
                        const name = window.prompt("Enter folder name:");
                        if (name) createFolder(name);
                      }}
                      className="flex items-center gap-3 px-6 py-3 btn-glass text-[11px]"
                    >
                      <FolderPlus className="w-5 h-5" />
                      New folder
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-4">
                    {savedImages.filter(img => currentFolderId === 'all' ? true : img.folderId === currentFolderId).length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-white/5 border border-white/5 rounded-[24px]">
                        <Bookmark className="w-16 h-16 mb-6" />
                        <p className="font-semibold tracking-[0.4em] text-sm uppercase">No visions here</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {savedImages
                          .filter(img => currentFolderId === 'all' ? true : img.folderId === currentFolderId)
                          .map((img) => (
                    <div 
                      key={img.id} 
                      onClick={() => setSelectedImage(img.url)}
                      className="group relative aspect-square bg-white/5 rounded-[20px] overflow-hidden border border-white/5 cursor-pointer"
                    >
                              <img src={img.url} alt="Saved" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-8 flex flex-col justify-between backdrop-blur-md">
                                <div className="space-y-4">
                                  <p className="text-[11px] font-medium line-clamp-4 text-white/90 leading-relaxed tracking-tight">{img.prompt}</p>
                                  <div className="flex flex-wrap gap-2">
                                    <div className="px-3 py-1 bg-white/10 rounded-full text-[8px] font-bold tracking-widest text-white/40 uppercase">
                                      {folders.find(f => f.id === img.folderId)?.name || 'Unsorted'}
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex gap-2">
                                    <button 
                                      onClick={() => {
                                        const link = document.createElement('a');
                                        link.href = img.url;
                                        link.download = `deto-lab-${img.id}.png`;
                                        link.click();
                                      }}
                                      className="flex-1 py-4 bg-white text-black font-bold rounded-lg text-[10px] tracking-widest uppercase hover:bg-white/90 transition-all"
                                    >
                                      Download
                                    </button>
                                    <button 
                                      onClick={() => deleteFromGallery(img.id)}
                                      className="p-4 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all border border-red-500/10"
                                    >
                                      <Trash2 className="w-5 h-5" />
                                    </button>
                                  </div>
                                  
                                  <div className="relative group/move">
                                    <button className="w-full py-4 bg-white/5 border border-white/10 text-white/40 font-bold rounded-lg text-[10px] tracking-widest uppercase hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2">
                                      <Move className="w-4 h-4" />
                                      Move to...
                                    </button>
                                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-zinc-900 border border-white/10 rounded-lg overflow-hidden opacity-0 invisible group-hover/move:opacity-100 group-hover/move:visible transition-all z-50 max-h-48 overflow-y-auto">
                                      {folders.filter(f => f.id !== 'all' && f.id !== img.folderId).map(f => (
                                        <button 
                                          key={f.id}
                                          onClick={() => moveImageToFolder(img.id, f.id)}
                                          className="w-full p-4 text-left text-[9px] font-bold tracking-widest text-white/40 hover:bg-white hover:text-black transition-colors uppercase"
                                        >
                                          {f.name}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="w-full max-w-3xl aspect-square relative z-10">
                <AnimatePresence mode="wait">
                  {mode === 'bulk' && (bulkResults.length > 0 || bulkProgress) ? (
                    <motion.div 
                      key="bulk-results"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full h-full flex flex-col space-y-6"
                    >
                      {bulkProgress && (
                        <div className="p-6 bg-white/5 border border-white/10 rounded-2xl space-y-4">
                          <div className="flex justify-between text-[10px] font-bold tracking-widest text-white/40 uppercase">
                            <span>Processing Bulk</span>
                            <span>{bulkProgress.current} / {bulkProgress.total}</span>
                          </div>
                          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                              className="h-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                            />
                          </div>
                          <div className="flex justify-center">
                            <button 
                              onClick={cancelGeneration}
                              className="text-[9px] font-bold tracking-widest text-red-500/60 hover:text-red-500 uppercase transition-colors"
                            >
                              Cancel Bulk Process
                            </button>
                          </div>
                        </div>
                      )}
                      
                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {bulkResults.map((result) => (
                            <motion.div 
                              key={result.id}
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="aspect-square rounded-xl overflow-hidden border border-white/10 relative group bg-white/5"
                            >
                              <img src={result.url} alt="Bulk Result" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-sm">
                                <button 
                                  onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = result.url;
                                    link.download = `bulk-${result.id}.png`;
                                    link.click();
                                  }}
                                  className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 transition-transform"
                                >
                                  <Download className="w-5 h-5" />
                                </button>
                                <button 
                                  onClick={() => setSelectedImage(result.url)}
                                  className="w-10 h-10 bg-white/10 text-white rounded-full flex items-center justify-center hover:scale-110 transition-transform border border-white/10"
                                >
                                  <Search className="w-5 h-5" />
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ) : showGalleryInResult ? (
                    <motion.div 
                      key="gallery-overlay"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full h-full bg-[#141414] flex flex-col overflow-hidden"
                    >
                      <div className="p-6 flex items-center justify-end">
                        <button 
                          onClick={() => setShowGalleryInResult(false)} 
                          className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {savedImages.map(img => (
                            <div 
                              key={img.id} 
                              onClick={() => {
                                if (mode === 'edit') selectGalleryImage(img.url, 'edit-base');
                                else if (mode === 'mockups') selectGalleryImage(img.url, 'mockup-base');
                                else if (mode === 'product') selectGalleryImage(img.url, 'product-base');
                                else if (mode === 'compose') selectGalleryImage(img.url, 'background');
                                setShowGalleryInResult(false);
                              }}
                              className="group relative aspect-square rounded-xl overflow-hidden border border-white/5 cursor-pointer hover:border-white/20 transition-all hover:scale-[1.02]"
                            >
                              <img src={img.url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Plus className="w-8 h-8 text-white" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ) : !modeResults[mode] && !isGenerating ? (
                    <motion.div 
                      key="empty"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="w-full h-full border border-white/5 bg-white/5 rounded-[24px] flex flex-col items-center justify-center text-white/5"
                    >
                      <div className="w-32 h-32 rounded-full border border-white/5 flex items-center justify-center mb-10">
                        <ImageIcon className="w-12 h-12 opacity-20" />
                      </div>
                      <p className="font-semibold tracking-[-0.02em] text-lg">Making the magic</p>
                      <p className="text-[11px] mt-6 font-mono font-semibold text-white/10">DE TOMASO LAB CORE v4.0</p>
                    </motion.div>
                  ) : isGenerating ? (
                    <motion.div 
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full h-full border border-white/10 bg-white/5 rounded-[24px] flex flex-col items-center justify-center overflow-hidden p-12"
                    >
                      <div className="relative mb-16">
                        <div className="w-48 h-48 rounded-full border border-white/10 border-t-4 border-blue-500 animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <SparkleIcon className="w-12 h-12 text-white" />
                        </div>
                      </div>
                      
                      <div className="w-full max-w-sm space-y-8">
                        <div className="space-y-4">
                          <div className="flex justify-between text-[11px] font-semibold tracking-widest text-white/40">
                            <span>Neural MAGIC</span>
                            <span>{generationTime}s</span>
                          </div>
                          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: "0%" }}
                              animate={{ width: "100%" }}
                              transition={{ duration: 60, ease: "linear" }}
                              className="h-full bg-blue-500"
                            />
                          </div>
                        </div>
                        
                        <div className="text-center space-y-6">
                          <p className="text-[11px] text-white/40 font-semibold tracking-widest leading-relaxed">
                            {generationTime < 15 ? "Initializing neural latents..." : 
                             generationTime < 30 ? "Manifesting visual structures..." :
                             generationTime < 45 ? "Refining high-frequency details..." :
                             "Finalizing image output..."}
                          </p>

                          <button 
                            onClick={cancelGeneration}
                            className="px-10 py-4 btn-glass text-[11px] hover:bg-red-500/20 hover:text-red-500"
                          >
                            Abort magic
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="result"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="w-full h-full border border-white/10 bg-white/5 rounded-[24px] relative group overflow-hidden"
                    >
                      <img 
                        src={modeResults[mode]!} 
                        alt="Generated" 
                        className="w-full h-full object-contain"
                      />
                      
                      <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-8 backdrop-blur-sm">
                        <button 
                          onClick={generateImage}
                          className="w-20 h-20 bg-white/10 border border-white/10 rounded-full flex items-center justify-center text-white hover:scale-110 transition-transform"
                        >
                          <RefreshCw className="w-8 h-8" />
                        </button>
                        <button 
                          onClick={downloadImage}
                          className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-black hover:scale-110 transition-transform"
                        >
                          <Download className="w-8 h-8" />
                        </button>
                      </div>

                      <div className="absolute top-10 left-10 bg-white/10 backdrop-blur-md border border-white/10 text-white px-6 py-3 rounded-full font-semibold text-[11px]">
                        {imageSize} // {aspectRatio}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </main>
  </div>
);
};

// Alto fijo para las cards de secciones del home, así llenan el ancho y el alto disponible
const SECTION_CARD_SIZE = "aspect-auto h-56 md:h-64 lg:h-[36vh] lg:min-h-[280px]";

const DashboardCard: React.FC<{
  title: string;
  description: string;
  image: string;
  onClick: () => void;
  isGallery?: boolean;
  onUse?: () => void;
  onDownload?: () => void;
  className?: string;
}> = ({ title, description, image, onClick, isGallery, onUse, onDownload, className }) => (
  <div
    onClick={onClick}
    className={cn("group relative aspect-[1/1.4] w-full rounded-lg overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] text-left shadow-2xl cursor-pointer", className)}
  >
    <img src={image} alt={title} className="absolute inset-0 w-full h-full object-cover transition-all duration-700 group-hover:scale-110 group-hover:brightness-110" referrerPolicy="no-referrer" />
    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent opacity-90 group-hover:opacity-70 transition-opacity" />

    {!isGallery ? (
      <div className="absolute inset-0 p-4 lg:p-6 flex flex-col justify-end">
        <div>
          {title && <h3 className="font-display text-3xl lg:text-[2.75rem] tracking-tight text-white leading-none">{title}</h3>}
          <p className="text-[11px] lg:text-[13px] text-white/70 leading-snug line-clamp-2 mt-1.5 lg:mt-2">{description}</p>
        </div>
      </div>
    ) : (
      <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm">
        <button 
          onClick={(e) => { e.stopPropagation(); onDownload?.(); }}
          className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all"
        >
          <Download className="w-5 h-5" />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onUse?.(); }}
          className="px-4 py-2 bg-white text-black rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-white/90 transition-all"
        >
          Use
        </button>
      </div>
    )}
  </div>
);

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: string;
}

const NavButton: React.FC<NavButtonProps> = ({ active, onClick, icon, label, badge }) => (
  <button 
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-4 px-4 py-3 rounded-full transition-all group relative",
      active 
        ? "bg-white/10 border border-white/10 shadow-[0_8px_32px_rgba(255,255,255,0.05)] backdrop-blur-md text-white" 
        : "text-white/40 hover:text-white hover:bg-white/5"
    )}
  >
    {active && (
      <motion.div 
        layoutId="nav-active-indicator"
        className="absolute -left-6 w-1.5 h-6 bg-[#8c8c8c] rounded-full shadow-[0_0_15px_rgba(140,140,140,0.6)]"
      />
    )}
    <div className={cn(
      "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
      active ? "text-[#8c8c8c]" : "text-white/40 group-hover:text-white"
    )}>
      {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { className: 'w-5 h-5' }) : icon}
    </div>
    <span className="text-sm font-medium tracking-tight">
      {label}
    </span>
    {badge && (
      <span className="ml-auto px-1.5 py-0.5 rounded-md bg-white/5 text-[8px] font-bold text-white/30 border border-white/5">
        {badge}
      </span>
    )}
    {active && !badge && (
      <ChevronRight className="ml-auto w-4 h-4 text-white/20" />
    )}
  </button>
);

interface DropZoneProps {
  label: string;
  icon: React.ReactNode;
  onDrop: (files: File[]) => void;
  onUrlDrop?: (url: string) => void;
  hideSubtext?: boolean;
  multiple?: boolean;
  minimal?: boolean;
}

const DropZone: React.FC<DropZoneProps> = ({ label, icon, onDrop, onUrlDrop, hideSubtext, multiple = false, minimal = false }) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] as string[] },
    multiple
  });

  const handleNativeDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Try to get URL from various formats
    let url = e.dataTransfer.getData('text/uri-list');
    if (!url) url = e.dataTransfer.getData('text/plain');
    
    // If no URL yet, try to parse HTML (common when dragging from another tab)
    if (!url) {
      const html = e.dataTransfer.getData('text/html');
      if (html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const img = doc.querySelector('img');
        if (img && img.src) {
          url = img.src;
        }
      }
    }
    
    // If it's a list, take the first one
    if (url && url.includes('\n')) {
      url = url.split('\n')[0];
    }

    // Clean up URL (remove any trailing whitespace or weird characters)
    url = url?.trim();

    if (url && onUrlDrop) {
      onUrlDrop(url);
    }
  };

  return (
    <div 
      {...getRootProps()} 
      onDrop={handleNativeDrop}
      className={cn(
        "cursor-pointer transition-all group",
        minimal 
          ? "p-2 flex items-center justify-center" 
          : "p-4 border border-white/20 rounded-xl backdrop-blur-sm",
        !minimal && (isDragActive ? "bg-white text-black" : "bg-white/[0.03] hover:bg-white/10"),
        minimal && (isDragActive ? "text-white scale-110" : "text-white/40 hover:text-white")
      )}
    >
      <input {...getInputProps()} />
      <div className={cn("flex items-center justify-center gap-2", minimal ? "flex-row" : "flex-col")}>
        <div className={cn("transition-colors", minimal ? "" : "text-white/40 group-hover:text-white")}>
          <Upload className="w-4 h-4" />
        </div>
        <div className="text-center">
          {label && <p className={cn("font-bold tracking-widest uppercase", minimal ? "text-[8px]" : "text-[8px]")}>{label}</p>}
          {!hideSubtext && !label && <p className="text-[7px] text-white/20 font-bold tracking-widest uppercase">Drop or Click</p>}
        </div>
      </div>
    </div>
  );
};
