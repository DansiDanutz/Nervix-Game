"""K1 armature (18 bones) and bone-parented anchors.

Every bone gets a roll so that its local X axis is world +X. Then a positive X rotation:
  - on an upward bone (spine, neck, head) leans it forward (toward -Y, the figure's front);
  - on a downward bone (legs, arms) swings its tip backward (+Y);
  - on the forward-pointing foot points the toes down.
Bone local Y is the bone axis, so location.y on `hips` is a vertical offset.
"""

import bpy
from mathutils import Matrix, Vector

from k1_common import RIG

# name: (head, tail, parent, kind) with kind "up", "down" or "fwd" (sets the roll).
BONES = {
    "root": ((0, 0, 0), (0, 0, 0.25), None, "up"),
    "hips": ((0, 0, 0.92), (0, 0, 1.05), "root", "up"),
    "spine": ((0, 0, 1.05), (0, 0, 1.22), "hips", "up"),
    "chest": ((0, 0, 1.22), (0, 0, 1.42), "spine", "up"),
    "neck": ((0, 0, 1.42), (0, -0.005, 1.53), "chest", "up"),
    "head": ((0, -0.005, 1.53), (0, -0.005, 1.77), "neck", "up"),
}
for side, s in (("L", 1.0), ("R", -1.0)):
    BONES.update({
        f"upper_arm_{side}": ((s * 0.19, 0, 1.40), (s * 0.245, 0.012, 1.12), "chest", "down"),
        f"forearm_{side}": ((s * 0.245, 0.012, 1.12), (s * 0.275, 0.0, 0.89), f"upper_arm_{side}", "down"),
        f"hand_{side}": ((s * 0.275, 0.0, 0.89), (s * 0.285, -0.005, 0.78), f"forearm_{side}", "down"),
        f"thigh_{side}": ((s * 0.09, 0, 0.90), (s * 0.095, 0, 0.50), "hips", "down"),
        f"shin_{side}": ((s * 0.095, 0, 0.50), (s * 0.095, 0.02, 0.10), f"thigh_{side}", "down"),
        f"foot_{side}": ((s * 0.095, 0.02, 0.10), (s * 0.10, -0.13, 0.03), f"shin_{side}", "fwd"),
    })

THIGH_LENGTH = 0.40
SHIN_LENGTH = 0.40

ROLL_Z_AXIS = {"up": (0, -1, 0), "down": (0, 1, 0), "fwd": (0, 0, -1)}

# Anchors: name -> (bone, world position in the rest pose). Runtime attaches labels, held props
# and back items here; the label floats clear of the tallest hair.
ANCHORS = {
    "label": ("head", (0.0, 0.0, 2.05)),
    "head_top": ("head", (0.0, 0.0, 1.80)),
    "hand_L": ("hand_L", (0.282, -0.01, 0.83)),
    "hand_R": ("hand_R", (-0.282, -0.01, 0.83)),
    "back": ("chest", (0.0, 0.16, 1.30)),
    "hip_R": ("hips", (-0.21, -0.02, 0.92)),
}


def anchor_node(name):
    return f"k1_anchor_{name}"


def build_rig(collection):
    data = bpy.data.armatures.new(RIG)
    rig = bpy.data.objects.new(RIG, data)
    collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent, kind) in BONES.items():
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = Vector(head), Vector(tail)
        eb.align_roll(Vector(ROLL_Z_AXIS[kind]))
        if parent:
            eb.parent = data.edit_bones[parent]
            eb.use_connect = False
        eb.use_deform = name != "root"
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    data.pose_position = "POSE"
    return rig


def build_anchors(collection, rig):
    bpy.context.view_layer.update()
    out = []
    for name, (bone, pos) in ANCHORS.items():
        empty = bpy.data.objects.new(anchor_node(name), None)
        empty.empty_display_type = "SPHERE"
        empty.empty_display_size = 0.03
        collection.objects.link(empty)
        empty.parent = rig
        empty.parent_type = "BONE"
        empty.parent_bone = bone
        bpy.context.view_layer.update()
        empty.matrix_world = Matrix.Translation(Vector(pos))
        out.append(empty)
    bpy.context.view_layer.update()
    return out
