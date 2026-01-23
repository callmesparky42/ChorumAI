/**
 * REVIEW COMMAND
 * 
 * Peer review code with cross-provider validation.
 * "Phone a Friend" from the terminal.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { H4x0rRenderer } from '../renderer/h4x0r';
import { getConfig } from '../config';
import { chorumApi } from '../api/client';

interface ReviewOptions {
  file?: string;
  dir?: string;
  focus: string;
  friend?: string;
}

export async function reviewCommand(
  options: ReviewOptions,
  renderer: H4x0rRenderer
): Promise<void> {
  const config = await getConfig();

  if (!config.apiToken) {
    renderer.error('Not authenticated. Run `chorum login` first.');
    return;
  }

  if (!options.file && !options.dir) {
    renderer.error('No file or directory specified');
    renderer.dim('Usage: chorum review --file src/app.ts');
    renderer.dim('       chorum review --dir src/ --focus security');
    return;
  }

  try {
    let files: string[] = [];

    if (options.file) {
      files = [options.file];
    } else if (options.dir) {
      // Find all code files in directory
      files = await glob(`${options.dir}/**/*.{ts,tsx,js,jsx,py,go,rs,java}`, {
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      });
    }

    if (files.length === 0) {
      renderer.error('No files found to review');
      return;
    }

    renderer.info(`Reviewing ${files.length} file(s) with focus: ${options.focus}`);
    console.log('');

    for (const file of files) {
      await reviewFile(file, options, renderer);
    }

  } catch (err: any) {
    renderer.error(`Review failed: ${err.message}`);
  }
}

async function reviewFile(
  filePath: string,
  options: ReviewOptions,
  renderer: H4x0rRenderer
): Promise<void> {
  renderer.print(`┌─ REVIEWING: ${filePath}`);
  renderer.print('│');

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    if (content.length > 50000) {
      renderer.warn('│  File too large, truncating to 50KB');
    }

    const truncatedContent = content.slice(0, 50000);

    renderer.dim('│  Sending to reviewer...');

    const result = await chorumApi.review({
      content: truncatedContent,
      focus: options.focus,
      friend: options.friend,
    });

    // Display results
    renderer.print('│');

    if (result.overallAssessment === 'approved') {
      renderer.success(`│  ASSESSMENT: APPROVED ✓`);
    } else if (result.overallAssessment === 'needs-changes') {
      renderer.warn(`│  ASSESSMENT: NEEDS CHANGES`);
    } else {
      renderer.error(`│  ASSESSMENT: CRITICAL ISSUES`);
    }

    renderer.dim(`│  Confidence: ${result.confidence} | Reviewer: ${result.reviewProvider}`);
    renderer.print('│');

    // Show issues by severity
    const critical = result.issues.filter((i: any) => i.severity === 'critical');
    const warnings = result.issues.filter((i: any) => i.severity === 'warning');
    const suggestions = result.issues.filter((i: any) => i.severity === 'suggestion');

    if (critical.length > 0) {
      renderer.error(`│  ✗ CRITICAL (${critical.length})`);
      for (const issue of critical) {
        renderer.print(`│    • ${issue.description}`);
        if (issue.location) renderer.dim(`│      Location: ${issue.location}`);
        if (issue.suggestion) renderer.dim(`│      Fix: ${issue.suggestion}`);
      }
      renderer.print('│');
    }

    if (warnings.length > 0) {
      renderer.warn(`│  ⚠ WARNINGS (${warnings.length})`);
      for (const issue of warnings) {
        renderer.print(`│    • ${issue.description}`);
        if (issue.location) renderer.dim(`│      Location: ${issue.location}`);
      }
      renderer.print('│');
    }

    if (suggestions.length > 0) {
      renderer.info(`│  ℹ SUGGESTIONS (${suggestions.length})`);
      for (const issue of suggestions) {
        renderer.print(`│    • ${issue.description}`);
      }
      renderer.print('│');
    }

    // Show approvals
    if (result.approvals && result.approvals.length > 0) {
      renderer.success(`│  ✓ APPROVED (${result.approvals.length})`);
      for (const approval of result.approvals.slice(0, 3)) {
        renderer.print(`│    • ${approval}`);
      }
      renderer.print('│');
    }

    // Summary
    renderer.dim(`│  Summary: ${result.summary}`);
    
    // Cost
    if (result.costUsd) {
      renderer.dim(`│  Cost: $${result.costUsd.toFixed(4)}`);
    }

    // Learned patterns
    if (result.learnedPatterns && result.learnedPatterns.length > 0) {
      renderer.print('│');
      renderer.info(`│  Patterns learned for future reviews:`);
      for (const pattern of result.learnedPatterns) {
        renderer.dim(`│    → ${pattern}`);
      }
    }

    renderer.print('│');
    renderer.print(`└${'─'.repeat(60)}`);
    console.log('');

  } catch (err: any) {
    renderer.error(`│  Review failed: ${err.message}`);
    renderer.print(`└${'─'.repeat(60)}`);
    console.log('');
  }
}
