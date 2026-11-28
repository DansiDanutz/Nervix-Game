"""K1 animation clips: idle, walk, run and talk, generated from periodic functions so every clip
loops exactly (the last key equals the first). Clips are in place (no root motion); the runtime
moves the character and picks walk or run by speed (speed_mps below).

Sign conventions (see k1_rig): +X on a leg or arm bone swings it backward, +X on a spine bone
leans it forward, +X on a foot points the toes down, +X bends the knee and -X bends the elbow.
"""

import math

import bpy

from k1_common import FPS
from k1_rig import SHIN_LENGTH, THIGH_LENGTH

CLIPS = {
    # name: (duration in seconds, metres per second the clip is tuned for)
    "idle": (3.0, 0.0),
    "walk": (1.0, 1.4),
    "run": (0.6, 3.6),
    "talk": (2.4, 0.0),
}


def _leg_drop(thigh_l, shin_l, thigh_r, shin_r):
    """How far the hips must sink so the longer-reaching leg still touches the ground."""
    def reach(t, s):
        return THIGH_LENGTH * math.cos(t) + SHIN_LENGTH * math.cos(t + s)
    return (THIGH_LENGTH + SHIN_LENGTH) - max(reach(thigh_l, shin_l), reach(thigh_r, shin_r))


def _legs(pose, p, swing, bias, knee_rest, knee_lift):
    thigh_l = bias - swing * math.sin(p)
    thigh_r = bias + swing * math.sin(p)
    shin_l = knee_rest + knee_lift * max(0.0, math.cos(p)) ** 1.5
    shin_r = knee_rest + knee_lift * max(0.0, -math.cos(p)) ** 1.5
    pose["thigh_L"], pose["shin_L"] = (thigh_l, 0, 0), (shin_l, 0, 0)
    pose["thigh_R"], pose["shin_R"] = (thigh_r, 0, 0), (shin_r, 0, 0)
    pose["foot_L"] = (-0.85 * (thigh_l + shin_l), 0, 0)
    pose["foot_R"] = (-0.85 * (thigh_r + shin_r), 0, 0)
    return _leg_drop(thigh_l, shin_l, thigh_r, shin_r)


def walk(p):
    pose = {}
    drop = _legs(pose, p, swing=0.4, bias=-0.03, knee_rest=0.08, knee_lift=0.62)
    pose["upper_arm_L"] = (0.34 * math.sin(p), 0, 0.04)
    pose["upper_arm_R"] = (-0.34 * math.sin(p), 0, -0.04)
    pose["forearm_L"] = (-0.22 - 0.2 * max(0.0, -math.sin(p)), 0, 0)
    pose["forearm_R"] = (-0.22 - 0.2 * max(0.0, math.sin(p)), 0, 0)
    pose["hips"] = (0.0, 0.09 * math.sin(p), 0.03 * math.cos(2 * p))
    pose["spine"] = (0.04, -0.05 * math.sin(p), 0)
    pose["chest"] = (0.0, -0.06 * math.sin(p), 0)
    pose["head"] = (-0.03, 0.04 * math.sin(p), 0)
    return pose, (0.0, -drop - 0.008 * math.cos(2 * p), 0.0)


def run(p):
    pose = {}
    drop = _legs(pose, p, swing=0.66, bias=-0.18, knee_rest=0.3, knee_lift=1.25)
    flight = 0.035 * max(0.0, math.cos(2 * p + 0.6))
    pose["upper_arm_L"] = (0.6 * math.sin(p), 0, 0.08)
    pose["upper_arm_R"] = (-0.6 * math.sin(p), 0, -0.08)
    pose["forearm_L"] = (-1.35 + 0.25 * math.sin(p), 0, 0)
    pose["forearm_R"] = (-1.35 - 0.25 * math.sin(p), 0, 0)
    pose["hand_L"] = (-0.2, 0, 0)
    pose["hand_R"] = (-0.2, 0, 0)
    pose["hips"] = (0.0, 0.14 * math.sin(p), 0.04 * math.cos(2 * p))
    pose["spine"] = (0.16, -0.08 * math.sin(p), 0)
    pose["chest"] = (0.04, -0.1 * math.sin(p), 0)
    pose["neck"] = (-0.12, 0, 0)
    pose["head"] = (-0.06, 0.05 * math.sin(p), 0)
    return pose, (0.0, -drop + flight - 0.02, 0.0)


def idle(p):
    breath = math.sin(p * 2)
    pose = {
        "spine": (0.01 * breath, 0.025 * math.sin(p), 0),
        "chest": (-0.015 * breath, 0, 0),
        "neck": (0.02, 0, 0),
        "head": (0.02 * math.sin(p * 2 + 1.0), 0.07 * math.sin(p + 0.8), 0),
        "upper_arm_L": (0.02 * breath, 0, 0.03),
        "upper_arm_R": (0.02 * breath, 0, -0.03),
        "forearm_L": (-0.14, 0, 0),
        "forearm_R": (-0.14, 0, 0),
        "thigh_L": (-0.02, 0, 0.02),
        "thigh_R": (0.0, 0, -0.03),
    }
    return pose, (0.008 * math.sin(p), -0.004 + 0.003 * breath, 0.0)


def talk(p):
    beat = math.sin(2 * p)
    pose = {
        "spine": (0.02, 0.04 * math.sin(p), 0),
        "chest": (0.0, 0.05 * math.sin(p), 0),
        "neck": (0.03, 0, 0),
        "head": (0.07 * math.sin(2 * p + 0.4), 0.1 * math.sin(p), 0.03 * math.sin(p + 1.0)),
        "upper_arm_R": (-0.38 - 0.14 * beat, 0, -0.12),
        "forearm_R": (-1.15 - 0.25 * math.sin(2 * p + 0.6), 0, 0),
        "hand_R": (-0.3, 0.45 * beat, 0),
        "upper_arm_L": (-0.1 - 0.06 * math.sin(p + 1.5), 0, 0.06),
        "forearm_L": (-0.55 - 0.15 * math.sin(p + 2.0), 0, 0),
        "hand_L": (-0.15, -0.2 * math.sin(p), 0),
        "thigh_L": (-0.02, 0, 0.02),
        "thigh_R": (0.0, 0, -0.03),
    }
    return pose, (0.005 * math.sin(p), -0.004, 0.0)


GENERATORS = {"idle": idle, "walk": walk, "run": run, "talk": talk}


def frame_count(name):
    return round(CLIPS[name][0] * FPS)


def _key_clip(rig, name):
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    frames = frame_count(name)
    for frame in range(frames + 1):
        p = 2.0 * math.pi * (frame % frames) / frames
        pose, hips_offset = GENERATORS[name](p)
        for pb in rig.pose.bones:
            pb.rotation_euler = pose.get(pb.name, (0.0, 0.0, 0.0))
            pb.location = hips_offset if pb.name == "hips" else (0.0, 0.0, 0.0)
            pb.keyframe_insert("rotation_euler", frame=frame)
            pb.keyframe_insert("location", frame=frame)
    action.use_frame_range = True
    action.frame_range = (0, frames)
    action.use_cyclic = True
    return action


def build_actions(rig):
    if rig.animation_data is None:
        rig.animation_data_create()
    actions = [_key_clip(rig, name) for name in CLIPS]
    rig.animation_data.action = bpy.data.actions["idle"]
    return actions
