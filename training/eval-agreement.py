# ============================================================================
# DEAD CODE — archived LLM learning program (closed 2026-10-10).
# Kept as a record of the experiment only. Not used by the game, the CPU
# opponents, or the playtest pipeline, and not maintained. Its labels came
# from the rollout search, which the CPU audit found too noisy to serve as
# ground truth (docs/CPU_PLAYTEST_AUDIT.md, F2). See
# docs/LLM_LEARNING_EXPERIMENTS.md for what was learned.
# ============================================================================
#
# Agreement eval: does the model's action_index match the rollout-best label?
#
# Used twice in the distillation pipeline:
#   Z3 (baseline):  python eval-agreement.py --test data/test.jsonl
#   Z5 (post-LoRA): python eval-agreement.py --test data/test.jsonl --adapter adapters/
#
# The metric mirrors the in-game R2 instrument (priorAgreement): the model
# sees the exact tournament prompt and emits {"action_index": N, ...}; we
# compare N to the search's argmax. Baseline expectation ~12% (the in-game
# measurement for qwen2.5:7b); the Z5 delta is the distillation verdict.
#
# Reports overall agreement plus per-actionType breakdown (via the
# test-meta.jsonl sidecar written by split-data.js) — the pivotal class is
# 'milestone', where the in-game record was 0/14.

import argparse, json, re, sys, time
from pathlib import Path

from mlx_lm import load, generate
from mlx_lm.sample_utils import make_sampler

p = argparse.ArgumentParser()
p.add_argument('--model', default='mlx-community/Qwen2.5-7B-Instruct-4bit')
p.add_argument('--adapter', default=None, help='LoRA adapter dir (Z5); omit for baseline (Z3)')
p.add_argument('--test', required=True, help='test.jsonl from split-data.js')
p.add_argument('--meta', default=None, help='test-meta.jsonl sidecar (default: sibling of --test)')
p.add_argument('--limit', type=int, default=0, help='cap examples (0 = all)')
p.add_argument('--max-tokens', type=int, default=60)
args = p.parse_args()

meta_path = Path(args.meta) if args.meta else Path(args.test).parent / 'test-meta.jsonl'
tests = [json.loads(l) for l in open(args.test) if l.strip()]
metas = [json.loads(l) for l in open(meta_path) if l.strip()] if meta_path.exists() else [{}] * len(tests)
if args.limit:
    tests, metas = tests[:args.limit], metas[:args.limit]

print(f'model={args.model} adapter={args.adapter or "(none — baseline)"} examples={len(tests)}', flush=True)
model, tokenizer = load(args.model, adapter_path=args.adapter)
sampler = make_sampler(temp=0.05)  # matches the in-game measurement config

def parse_action_index(text):
    # Same tolerance as the harness: JSON anywhere in the output, index as
    # int or numeric string.
    m = re.search(r'\{[^{}]*"action_index"[^{}]*\}', text, re.DOTALL)
    if m:
        try:
            v = json.loads(m.group(0)).get('action_index')
            if isinstance(v, int): return v
            if isinstance(v, str) and v.strip().lstrip('-').isdigit(): return int(v)
        except json.JSONDecodeError:
            pass
    m = re.search(r'"action_index"\s*:\s*"?(-?\d+)', text)
    return int(m.group(1)) if m else None

overall = {'agree': 0, 'wrong': 0, 'invalid': 0}
by_type = {}
t0 = time.time()

for i, (ex, meta) in enumerate(zip(tests, metas)):
    sys_msg, user_msg, assistant = ex['messages'][0], ex['messages'][1], ex['messages'][2]
    label = json.loads(assistant['content'])['action_index']
    prompt = tokenizer.apply_chat_template(
        [sys_msg, user_msg], tokenize=False, add_generation_prompt=True)
    out = generate(model, tokenizer, prompt=prompt, max_tokens=args.max_tokens, sampler=sampler)
    pred = parse_action_index(out)

    n_actions = meta.get('nActions')
    if pred is None or (n_actions and not (0 <= pred < n_actions)):
        bucket = 'invalid'
    else:
        bucket = 'agree' if pred == label else 'wrong'
    overall[bucket] += 1
    at = meta.get('actionType', '?')
    by_type.setdefault(at, {'agree': 0, 'wrong': 0, 'invalid': 0})[bucket] += 1

    if (i + 1) % 20 == 0:
        done = i + 1
        rate = overall['agree'] / done
        eta = (time.time() - t0) / done * (len(tests) - done) / 60
        print(f'  [{done}/{len(tests)}] agreement so far {rate:.1%}  (~{eta:.0f} min left)', flush=True)

n = len(tests)
print()
print(f'=== AGREEMENT: {overall["agree"]}/{n} = {overall["agree"]/n:.1%} '
      f'(wrong {overall["wrong"]}, invalid {overall["invalid"]}) ===')
print(f'elapsed: {(time.time()-t0)/60:.1f} min')
print()
print('by action type (label class):')
for at, c in sorted(by_type.items(), key=lambda kv: -sum(kv[1].values())):
    tot = sum(c.values())
    print(f'  {at:10s} {c["agree"]:4d}/{tot:<4d} = {c["agree"]/tot:.1%}')
