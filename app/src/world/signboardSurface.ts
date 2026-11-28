/**
 * B4: which meshes of a loaded K2 house receive the painted sign texture.
 *
 * In every K2 GLB the `sign_board` node's mesh has two primitives: the blank
 * board (`k2_sign_blank`) and its wood frame (`k2_wood_dark`). three's
 * GLTFLoader turns that into a Group named `sign_board` holding one Mesh per
 * primitive, named after the mesh (not the node). So the sign is the node
 * named `surfaceNode` (scene name, or the original glTF name kept in
 * userData.name), and the target is each Mesh at or under it whose material is
 * the board material. The frame and any board-material mesh elsewhere stay.
 *
 * Duck-typed over three's Object3D so Node tests it without three; pure.
 */

export const SIGN_BOARD_MATERIAL = "k2_sign_blank";

interface NamedMaterial {
  readonly name?: string;
}

export interface SceneNode {
  readonly name: string;
  readonly isMesh?: boolean;
  readonly material?: NamedMaterial | readonly NamedMaterial[];
  readonly userData?: Record<string, unknown>;
  readonly children: readonly SceneNode[];
}

const isNamed = (node: SceneNode, name: string) => node.name === name || node.userData?.name === name;

function findNode(root: SceneNode, name: string): SceneNode | undefined {
  if (isNamed(root, name)) return root;
  for (const child of root.children) {
    const hit = findNode(child, name);
    if (hit) return hit;
  }
  return undefined;
}

function hasMaterial(node: SceneNode, materialName: string): boolean {
  const { material } = node;
  if (!material) return false;
  const list: readonly NamedMaterial[] = Array.isArray(material) ? material : [material as NamedMaterial];
  return list.some((m) => m.name === materialName);
}

function boardMeshes(node: SceneNode, materialName: string): readonly SceneNode[] {
  const own = node.isMesh && hasMaterial(node, materialName) ? [node] : [];
  return [...own, ...node.children.flatMap((c) => boardMeshes(c, materialName))];
}

/** The board meshes of the sign node; [] when the node or the board material is missing. */
export function signSurfaceMeshes(root: SceneNode, surfaceNode: string, boardMaterial: string = SIGN_BOARD_MATERIAL): readonly SceneNode[] {
  const sign = findNode(root, surfaceNode);
  return Object.freeze(sign ? [...boardMeshes(sign, boardMaterial)] : []);
}

/** A K2 optional node's default visibility (shown unless k2_default_visible is false); undefined for other nodes. */
export function k2OptionVisible(userData: Record<string, unknown> | undefined): boolean | undefined {
  if (!userData?.k2_option) return undefined;
  return userData.k2_default_visible !== false;
}
