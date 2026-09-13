// Herramientas del estudio: qué imágenes pide cada una, qué le decimos
// al modelo sobre cada imagen y en qué carpeta de la galería se guarda.

import type { InputImage } from './imageInput';

export type ToolId = 'create' | 'edit' | 'mockup' | 'product' | 'bulk';

export type SlotId =
  | 'background'
  | 'subject'
  | 'reference'
  | 'edit-base'
  | 'extra'
  | 'mockup-base'
  | 'mockup-design'
  | 'product-base'
  | 'product-ref'
  | 'product-logo'
  | 'bulk-base'
  | 'bulk-ref';

export type Inputs = Partial<Record<SlotId, InputImage[]>>;

export interface SlotSpec {
  id: SlotId;
  label: string;
  hint: string;
  /** Cantidad máxima de imágenes en el slot */
  max: number;
  required?: boolean;
  /** Imagen base: define el formato "igual a la foto" y el antes/después */
  base?: boolean;
  /** Texto que acompaña a la imagen en el pedido al modelo */
  instruction: string;
}

export interface ToolSpec {
  id: ToolId;
  name: string;
  description: string;
  slots: SlotSpec[];
  promptLabel: string;
  promptPlaceholder: string;
  promptRequired: boolean;
  /** Instrucciones fijas que van antes de lo que escribe el usuario */
  builtInPrompt?: string;
  folderId: string;
  cover: string;
}

export const MOCKUP_PROMPT = "Replace the existing content inside the mockup with the uploaded design. The design must completely fill the intended mockup frame or surface area. Accurately match the perspective, scale, lighting, shadows, and surface distortion of the original mockup. Remove the previous artwork and seamlessly integrate the new design so it looks naturally embedded into the mockup structure. Respect the boundaries of the frame or object and ensure the design fits precisely within it.";

export const PRODUCT_PROMPT = "Integrate the main product into a professional, high-end commercial setting. Use the provided reference image to guide the style, lighting, material feel, and overall atmosphere. Ensure the product remains the central focus, maintaining its original form and details while blending seamlessly with the environment. If a logo is provided, place it naturally on the product or within the scene in a way that looks authentic and high-quality. The final result should look like a premium advertisement photograph.";

export const BASE_PRODUCT_PROMPT = `Use the product image as the exact base object.
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

export const TOOLS: Record<ToolId, ToolSpec> = {
  create: {
    id: 'create',
    name: 'Crear',
    description: 'Generá una imagen desde cero. Sumá fotos si querés guiarla.',
    slots: [
      { id: 'background', label: 'Fondo', hint: 'Escena o lugar', max: 1, instruction: 'Use this as the background.' },
      { id: 'subject', label: 'Sujeto', hint: 'Persona, objeto o personaje', max: 1, instruction: "Use this subject (person, object or character) and keep its likeness." },
      { id: 'reference', label: 'Referencias', hint: 'Estilo, luz o composición', max: 3, instruction: 'Use this as a style or composition reference.' },
    ],
    promptLabel: 'Qué querés ver',
    promptPlaceholder: 'Ej: una silla de madera sobre una colina al atardecer, luz suave, foto analógica',
    promptRequired: true,
    folderId: 'all',
    cover: 'https://i.pinimg.com/736x/d1/2e/8e/d12e8e6856ef91f99b389648ae910e80.jpg',
  },
  edit: {
    id: 'edit',
    name: 'Editar',
    description: 'Cambiá algo de una foto: el cielo, un objeto, la ropa, lo que quieras.',
    slots: [
      { id: 'edit-base', label: 'Foto a editar', hint: 'La imagen que querés cambiar', max: 1, required: true, base: true, instruction: 'This is the image to modify. Follow the instructions to edit it.' },
      { id: 'extra', label: 'Imágenes extra', hint: 'Opcional: algo para sumar a la foto', max: 4, instruction: 'Additional asset: use it in the edit only as the instructions describe.' },
    ],
    promptLabel: 'Qué querés cambiar',
    promptPlaceholder: 'Ej: cambiá el cielo por un atardecer y sacá a la persona del fondo',
    promptRequired: true,
    folderId: 'all',
    cover: 'https://i.pinimg.com/736x/4f/a3/93/4fa39380edb038dd930f6bbccbae6cab.jpg',
  },
  mockup: {
    id: 'mockup',
    name: 'Mockup',
    description: 'Poné tu diseño dentro de un mockup respetando perspectiva y luz.',
    slots: [
      { id: 'mockup-base', label: 'Mockup', hint: 'Foto del cartel, remera, pantalla…', max: 1, required: true, base: true, instruction: 'This is the base mockup image.' },
      { id: 'mockup-design', label: 'Tu diseño', hint: 'La imagen que va adentro', max: 1, required: true, instruction: 'This is the design to be integrated into the mockup.' },
    ],
    promptLabel: 'Indicaciones extra',
    promptPlaceholder: 'Opcional. Ej: que el diseño ocupe solo la mitad de arriba',
    promptRequired: false,
    builtInPrompt: MOCKUP_PROMPT,
    folderId: 'mockups',
    cover: 'https://i.pinimg.com/1200x/f0/e9/a1/f0e9a10b372f4ba24dad94217636fb26.jpg',
  },
  product: {
    id: 'product',
    name: 'Producto',
    description: 'Fotos publicitarias de tu producto sin cambiarle nada.',
    slots: [
      { id: 'product-base', label: 'Producto', hint: 'Mejor con fondo limpio', max: 1, required: true, base: true, instruction: 'This is the main product image to be integrated.' },
      { id: 'product-ref', label: 'Estilo', hint: 'Opcional: luz y ambiente que buscás', max: 1, instruction: 'Use this image for style, lighting, and material reference.' },
      { id: 'product-logo', label: 'Logo', hint: 'Opcional: se aplica tal cual', max: 1, instruction: 'This is the logo to be integrated onto the product or into the scene.' },
    ],
    promptLabel: 'Indicaciones extra',
    promptPlaceholder: 'Opcional. Ej: sobre mármol blanco con luz de mañana',
    promptRequired: false,
    builtInPrompt: PRODUCT_PROMPT,
    folderId: 'products',
    cover: 'https://i.pinimg.com/736x/ab/0e/1e/ab0e1efcad96fcb933ea954784b87a4b.jpg',
  },
  bulk: {
    id: 'bulk',
    name: 'Lote',
    description: 'Aplicá el mismo cambio a muchas fotos de una vez.',
    slots: [
      { id: 'bulk-base', label: 'Fotos', hint: 'Todas las que quieras procesar', max: 50, required: true, base: true, instruction: 'BASE IMAGE: This is the primary scene or subject. Modify this image by following the prompt instructions. If a reference asset is provided, you may need to integrate it, swap objects with it, or follow its style as requested.' },
      { id: 'bulk-ref', label: 'Referencia', hint: 'Opcional: estilo u objeto para todas', max: 1, instruction: 'REFERENCE ASSET: This image serves as a reference. It can be a style guide (lighting, mood) OR a specific object/product that needs to be integrated, swapped, or replaced into the base image. Follow the prompt instructions carefully regarding this asset.' },
    ],
    promptLabel: 'Qué hacer con cada foto',
    promptPlaceholder: 'Ej: sacá el fondo y poné uno blanco de estudio',
    promptRequired: true,
    folderId: 'all',
    cover: 'https://i.pinimg.com/1200x/34/69/9e/34699eca0b59961a9490f5279181afe4.jpg',
  },
};

export const TOOL_ORDER: ToolId[] = ['create', 'edit', 'mockup', 'product', 'bulk'];

export const GALLERY_COVER = 'https://i.pinimg.com/1200x/5c/85/8e/5c858e29b3be3e26b63a014e5d4664e0.jpg';

/** Atajos para mandar una imagen ya generada a otra herramienta. */
export const USE_AS: { label: string; tool: ToolId; slot: SlotId }[] = [
  { label: 'Editar esta imagen', tool: 'edit', slot: 'edit-base' },
  { label: 'Usar como referencia', tool: 'create', slot: 'reference' },
  { label: 'Usar como fondo', tool: 'create', slot: 'background' },
  { label: 'Poner en un mockup', tool: 'mockup', slot: 'mockup-design' },
  { label: 'Usar como producto', tool: 'product', slot: 'product-base' },
];

export const baseSlotOf = (toolId: ToolId): SlotSpec | undefined =>
  TOOLS[toolId].slots.find((s) => s.base);

/** Qué le falta al usuario para poder generar. Lista vacía = listo. */
export const missingFor = (toolId: ToolId, inputs: Inputs, prompt: string): string[] => {
  const tool = TOOLS[toolId];
  const missing = tool.slots
    .filter((s) => s.required && !inputs[s.id]?.length)
    .map((s) => s.label.toLowerCase());

  const hasImages = tool.slots.some((s) => inputs[s.id]?.length);
  const promptOptional = toolId === 'create' && hasImages;
  if (tool.promptRequired && !prompt.trim() && !promptOptional) {
    missing.push(toolId === 'create' ? 'una descripción' : 'las instrucciones');
  }
  return missing;
};
