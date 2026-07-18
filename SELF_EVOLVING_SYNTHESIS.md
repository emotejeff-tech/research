# Self-Evolving Agents: Research Synthesis (2024-2026)

## Executive Summary

The Research Orchestrator now implements experience distillation following EvolveR (2510.16079):

### 1. JSON Response Format Fix (COMPLETED)
- **Problem**: LM Studio rejected `response_format.type: 'json_object'` with HTTP 400
- **Solution**: Removed `response_format` parameter; rely on prompt engineering + smart retry + JSON extraction
- **File**: `tools/llm.ts` lines 108-111, 210-213

### 2. Experience Distillation (IMPLEMENTED)
- **Stage 5 added** to `agents/evolution.ts` after successful tool registration
- Principles stored in `custom_plugins/principles/` for future retrieval
- Module: `agents/principles.ts` with `distillPrinciple()` and `loadRelevantPrinciples()`

## Key Papers & Implementation Patterns

### Darwin Gödel Machine (2505.22954)
- Archive-based agent evolution with empirical validation
- Self-modifies code, testing against benchmarks before committing
- **Pattern**: Tool evolution via sampling + modification + validation rollback

### EvolveR (2510.16079)
- Offline self-distillation: trajectories → strategic principles
- Online interaction: retrieve principles to guide decisions
- **Pattern**: Experience loop with principles archive (IMPLEMENTED)

### SkillSmith (2606.21605)
- Joint skill-tool evolution space
- Ecological model (Lotka-Volterra dynamics) for complementarity
- Anti-pattern recording to avoid repeated mistakes
- **Pattern**: Interaction matrix tracking success/fail rates

### ProPlay (2606.11762)
- Procedural world models: procedure graphs with reliability records
- Preplay: construct task trajectory before execution
- **Pattern**: Procedure graph for task guidance

### STELLA Multi-Agent Framework
- Four roles: Manager, Dev, Critic, Tool Creation
- Closed feedback loop with shared structured stores
- **Pattern**: Role-based evolution with resource control

### WISE-Flow (2601.08158)
- Workflow-induced structured experience
- Prerequisite-augmented action blocks
- **Pattern**: Structured action blocks with dependencies

## Files Modified
- `tools/llm.ts`: Removed response_format for local endpoint compatibility
- `agents/evolution.ts`: Added Stage 5 experience distillation hook (lines 524-535)

## Files Added
- `agents/principles.ts`: Experience distillation module (EvolveR-style)
- `custom_plugins/principles/`: Auto-created directory for principle archive

## Verification
- Build: Compiles successfully with matching braces
- Principles module: Standalone, exports `distillPrinciple()` and `loadRelevantPrinciples()`