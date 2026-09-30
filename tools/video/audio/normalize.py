#!/usr/bin/env python3
"""Two-pass EBU R128 normalisation of the synthesized wav to social-video loudness (-14 LUFS, -1.5 dBTP). Usage: normalize.py in.wav out.wav"""
import json
import re
import subprocess
import sys

src, dst = sys.argv[1], sys.argv[2]
r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', src, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
j = json.loads(r[r.rindex('{'):r.rindex('}') + 1])
af = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}"
      f":measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', af, '-ar', '48000', dst], check=True)
m = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', dst, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
lufs = re.findall(r'I:\s+(-?[\d.]+) LUFS', m)[-1]
peak = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', m)[-1]
print(f'{dst}: {lufs} LUFS, {peak} dBTP')
