// Herramientas del estudio: qué imágenes pide cada una, qué le decimos
// al modelo sobre cada imagen y en qué carpeta de la galería se guarda.

import type { InputImage } from './imageInput';

export type ToolId = 'create' | 'edit' | 'mockup' | 'product' | 'bulk';

export type SlotId =
  | 'create-images'
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
  /** Imagen base: define el formato "Original photo" */
  base?: boolean;
  /** Las imágenes van numeradas ("Image 1", "Image 2"…) para nombrarlas en el prompt */
  numbered?: boolean;
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
  /** Prompt precargado y editable (igual que en la versión original) */
  defaultPrompt?: string;
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
    name: 'Create',
    description: 'Generate an image from a prompt. Add photos and tell it what to do with them.',
    slots: [
      {
        id: 'create-images',
        label: 'Images',
        hint: 'Optional · numbered so you can refer to them',
        max: 10,
        base: true,
        numbered: true,
        instruction: '',
      },
    ],
    promptLabel: 'Prompt',
    promptPlaceholder: 'e.g. Put the person from image 1 on the beach from image 2, golden hour light',
    promptRequired: true,
    folderId: 'all',
    cover: 'https://i.pinimg.com/736x/d1/2e/8e/d12e8e6856ef91f99b389648ae910e80.jpg',
  },
  edit: {
    id: 'edit',
    name: 'Edit',
    description: 'Change something in a photo: the sky, an object, the outfit, anything.',
    slots: [
      { id: 'edit-base', label: 'Image to edit', hint: 'The photo you want to change', max: 1, required: true, base: true, instruction: 'This is the image to modify. Follow the instructions to edit it.' },
      { id: 'extra', label: 'Extra images', hint: 'Optional · something to add to the photo', max: 4, instruction: 'Additional asset: use it in the edit only as the instructions describe.' },
    ],
    promptLabel: 'Edit instructions',
    promptPlaceholder: 'e.g. Change the sky to a sunset and remove the person in the background',
    promptRequired: true,
    folderId: 'all',
    cover: 'https://i.pinimg.com/736x/4f/a3/93/4fa39380edb038dd930f6bbccbae6cab.jpg',
  },
  mockup: {
    id: 'mockup',
    name: 'Mockup',
    description: 'Place your design inside a mockup, matching perspective and light.',
    slots: [
      { id: 'mockup-base', label: 'Mockup', hint: 'Photo of the poster, shirt, screen…', max: 1, required: true, base: true, instruction: 'This is the base mockup image.' },
      { id: 'mockup-design', label: 'Your design', hint: 'The artwork that goes inside', max: 1, required: true, instruction: 'This is the design to be integrated into the mockup.' },
    ],
    promptLabel: 'Integration prompt',
    promptPlaceholder: 'Describe how the design should be integrated…',
    promptRequired: false,
    defaultPrompt: MOCKUP_PROMPT,
    folderId: 'mockups',
    cover: 'https://i.pinimg.com/1200x/f0/e9/a1/f0e9a10b372f4ba24dad94217636fb26.jpg',
  },
  product: {
    id: 'product',
    name: 'Product',
    description: 'Ad-quality photos of your product without changing it.',
    slots: [
      { id: 'product-base', label: 'Product', hint: 'Best with a clean background', max: 1, required: true, base: true, instruction: 'This is the main product image to be integrated.' },
      { id: 'product-ref', label: 'Style reference', hint: 'Optional · the light and mood you want', max: 1, instruction: 'Use this image for style, lighting, and material reference.' },
      { id: 'product-logo', label: 'Logo', hint: 'Optional · applied as is', max: 1, instruction: 'This is the logo to be integrated onto the product or into the scene.' },
    ],
    promptLabel: 'Integration prompt',
    promptPlaceholder: 'Describe how the product should be integrated…',
    promptRequired: false,
    defaultPrompt: PRODUCT_PROMPT,
    folderId: 'products',
    cover: 'https://i.pinimg.com/1200x/6b/c6/5d/6bc65d55ef013c28a09a3f969263afb9.jpg',
  },
  bulk: {
    id: 'bulk',
    name: 'Bulk',
    description: 'Apply the same change to many photos at once.',
    slots: [
      { id: 'bulk-base', label: 'Photos', hint: 'All the ones you want to process', max: 50, required: true, base: true, instruction: 'BASE IMAGE: This is the primary scene or subject. Modify this image by following the prompt instructions. If a reference asset is provided, you may need to integrate it, swap objects with it, or follow its style as requested.' },
      { id: 'bulk-ref', label: 'Reference', hint: 'Optional · style or object for all of them', max: 1, instruction: 'REFERENCE ASSET: This image serves as a reference. It can be a style guide (lighting, mood) OR a specific object/product that needs to be integrated, swapped, or replaced into the base image. Follow the prompt instructions carefully regarding this asset.' },
    ],
    promptLabel: 'Shared prompt',
    promptPlaceholder: 'e.g. Remove the background and replace it with a white studio backdrop',
    promptRequired: true,
    folderId: 'all',
    cover: '/covers/bulk.jpg',
  },
};

export const TOOL_ORDER: ToolId[] = ['create', 'edit', 'mockup', 'product', 'bulk'];

export const GALLERY_COVER = 'https://i.pinimg.com/1200x/5c/85/8e/5c858e29b3be3e26b63a014e5d4664e0.jpg';

/** Atajos para mandar una imagen ya generada a otra herramienta. */
export const USE_AS: { label: string; tool: ToolId; slot: SlotId }[] = [
  { label: 'Edit this image', tool: 'edit', slot: 'edit-base' },
  { label: 'Use in Create', tool: 'create', slot: 'create-images' },
  { label: 'Put in a mockup', tool: 'mockup', slot: 'mockup-design' },
  { label: 'Use as product', tool: 'product', slot: 'product-base' },
];

export const baseSlotOf = (toolId: ToolId): SlotSpec | undefined =>
  TOOLS[toolId].slots.find((s) => s.base);

export const joinList = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** Qué le falta al usuario para poder generar. Lista vacía = listo. */
export const missingFor = (toolId: ToolId, inputs: Inputs, prompt: string): string[] => {
  const tool = TOOLS[toolId];
  const missing = tool.slots
    .filter((s) => s.required && !inputs[s.id]?.length)
    .map((s) => s.label.toLowerCase());

  // Igual que antes: Create acepta solo prompt, solo imágenes o las dos cosas
  const hasImages = tool.slots.some((s) => inputs[s.id]?.length);
  if (tool.promptRequired && !prompt.trim() && !(toolId === 'create' && hasImages)) {
    missing.push(toolId === 'create' ? 'a prompt' : 'instructions');
  }
  return missing;
};
