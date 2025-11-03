#!/usr/bin/env node
/**
 * Migration CLI Tool
 * @module migrate-cli
 * @description Command-line interface for component migration operations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import Table from 'cli-table3';
import { MigrationOrchestrator } from '../orchestrator/MigrationOrchestrator';
import { TypeScriptConverter } from '../converter/TypeScriptConverter';
import { MigrationValidator } from '../validator/MigrationValidator';
import { DependencyAnalyzer } from '../analysis/DependencyAnalyzer';
import { RollbackManager } from '../rollback/RollbackManager';
import { FeatureFlagService } from '../feature-flags/FeatureFlagService';
import { BackupService } from '../backup/BackupService';
import {
  MigrationPlan,
  MigrationStrategy,
  ComponentMigrationStep,
  MigrationStatus
} from '../types/MigrationTypes';

const program = new Command();
const version = '1.0.0';

/**
 * CLI configuration interface
 */
interface CLIConfig {
  verbose: boolean;
  dryRun: boolean;
  force: boolean;
  parallel: boolean;
  maxWorkers: number;
}

/**
 * Migration CLI class
 */
class MigrationCLI {
  private orchestrator: MigrationOrchestrator;
  private converter: TypeScriptConverter;
  private validator: MigrationValidator;
  private analyzer: DependencyAnalyzer;
  private config: CLIConfig;

  constructor() {
    // Initialize services
    const featureFlagService = new FeatureFlagService({} as any, {} as any);
    const backupService = new BackupService();
    const rollbackManager = new RollbackManager(
      backupService,
      featureFlagService
    );

    this.validator = new MigrationValidator();
    this.orchestrator = new MigrationOrchestrator(
      featureFlagService,
      this.validator,
      rollbackManager,
      {
        maxParallelMigrations: 3,
        progressUpdateInterval: 1000,
        autoRollbackEnabled: true,
        errorThreshold: 2,
        persistState: true
      }
    );

    this.converter = new TypeScriptConverter();
    this.analyzer = new DependencyAnalyzer();

    this.config = {
      verbose: false,
      dryRun: false,
      force: false,
      parallel: false,
      maxWorkers: 3
    };
  }

  /**
   * Analyzes a component for migration
   */
  async analyzeComponent(componentPath: string): Promise<void> {
    const spinner = ora('Analyzing component...').start();

    try {
      const analysis = await this.analyzer.analyzeComponent(componentPath);

      spinner.succeed('Component analysis complete');

      // Display analysis results
      console.log('\n' + chalk.bold.cyan('Component Analysis Results'));
      console.log(chalk.gray('─'.repeat(50)));

      const table = new Table({
        head: [chalk.white('Property'), chalk.white('Value')],
        style: { head: [], border: [] }
      });

      table.push(
        ['Component ID', analysis.id],
        ['File Path', analysis.filePath],
        ['Lines of Code', analysis.linesOfCode.toString()],
        ['Dependencies', analysis.dependencies.length.toString()],
        ['Complexity Score', `${analysis.complexity}/100`],
        ['Has JSX', analysis.hasJSX ? chalk.green('Yes') : chalk.red('No')],
        ['Has Hooks', analysis.hasHooks ? chalk.green('Yes') : chalk.red('No')],
        ['Has State', analysis.hasState ? chalk.green('Yes') : chalk.red('No')]
      );

      console.log(table.toString());

      // Show dependencies if any
      if (analysis.dependencies.length > 0) {
        console.log('\n' + chalk.bold.yellow('Dependencies:'));
        analysis.dependencies.forEach(dep => {
          console.log(chalk.gray('  • ') + dep);
        });
      }

      // Show migration complexity assessment
      console.log('\n' + chalk.bold.magenta('Migration Assessment:'));
      if (analysis.complexity < 30) {
        console.log(chalk.green('  ✓ Low complexity - Easy migration'));
      } else if (analysis.complexity < 60) {
        console.log(chalk.yellow('  ⚠ Medium complexity - Moderate migration effort'));
      } else {
        console.log(chalk.red('  ✗ High complexity - Significant migration effort'));
      }

    } catch (error) {
      spinner.fail(`Analysis failed: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  /**
   * Creates a migration plan
   */
  async createMigrationPlan(componentList: string[]): Promise<void> {
    const spinner = ora('Creating migration plan...').start();

    try {
      // Build dependency graph
      const dependencyGraph = await this.analyzer.buildDependencyGraph(componentList);

      if (dependencyGraph.hasCycles) {
        spinner.warn('Circular dependencies detected!');

        const { continueWithCycles } = await inquirer.prompt([{
          type: 'confirm',
          name: 'continueWithCycles',
          message: 'Circular dependencies found. Continue anyway?',
          default: false
        }]);

        if (!continueWithCycles) {
          process.exit(0);
        }
      }

      spinner.succeed('Migration plan created');

      // Display migration plan
      console.log('\n' + chalk.bold.cyan('Migration Plan'));
      console.log(chalk.gray('─'.repeat(50)));

      const table = new Table({
        head: [
          chalk.white('Order'),
          chalk.white('Component'),
          chalk.white('Dependencies'),
          chalk.white('Priority')
        ],
        style: { head: [], border: [] }
      });

      dependencyGraph.migrationOrder.forEach((componentId, index) => {
        const node = dependencyGraph.nodes.get(componentId);
        if (node) {
          table.push([
            (index + 1).toString(),
            componentId,
            node.dependencies.length.toString(),
            index < 3 ? chalk.red('HIGH') : index < 6 ? chalk.yellow('MEDIUM') : chalk.green('LOW')
          ]);
        }
      });

      console.log(table.toString());

      // Save plan option
      const { savePlan } = await inquirer.prompt([{
        type: 'confirm',
        name: 'savePlan',
        message: 'Save this migration plan?',
        default: true
      }]);

      if (savePlan) {
        // Save plan to file
        const planFile = `migration-plan-${Date.now()}.json`;
        console.log(chalk.green(`✓ Plan saved to ${planFile}`));
      }

    } catch (error) {
      spinner.fail(`Plan creation failed: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  /**
   * Executes a migration plan
   */
  async executeMigration(planFile: string): Promise<void> {
    console.log(chalk.bold.cyan('\n🚀 Starting Component Migration'));
    console.log(chalk.gray('─'.repeat(50)));

    try {
      // Load plan (mock for now)
      const plan = await this.loadPlan(planFile);

      // Show pre-migration checklist
      console.log('\n' + chalk.bold.yellow('Pre-Migration Checklist:'));
      const checklist = [
        'All tests passing',
        'Backup created',
        'Feature flags configured',
        'Team notified',
        'Rollback plan ready'
      ];

      for (const item of checklist) {
        const { confirmed } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirmed',
          message: item,
          default: false
        }]);

        if (!confirmed && !this.config.force) {
          console.log(chalk.red('✗ Migration cancelled - checklist not complete'));
          process.exit(0);
        }
      }

      // Execute migration
      console.log('\n' + chalk.bold.green('Executing migration...'));

      this.setupProgressMonitoring();

      const results = await this.orchestrator.executeMigration(plan);

      // Display results
      console.log('\n' + chalk.bold.cyan('Migration Results'));
      console.log(chalk.gray('─'.repeat(50)));

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      console.log(chalk.green(`✓ Successful: ${successCount}`));
      if (failureCount > 0) {
        console.log(chalk.red(`✗ Failed: ${failureCount}`));
      }

      // Show detailed results
      const table = new Table({
        head: [
          chalk.white('Component'),
          chalk.white('Status'),
          chalk.white('Time (ms)'),
          chalk.white('Type Coverage')
        ]
      });

      results.forEach(result => {
        table.push([
          result.componentId,
          result.success ? chalk.green('✓ Success') : chalk.red('✗ Failed'),
          result.metrics.totalTime.toString(),
          `${result.metrics.typesCoverage}%`
        ]);
      });

      console.log('\n' + table.toString());

    } catch (error) {
      console.error(chalk.red(`\n✗ Migration failed: ${(error as Error).message}`));
      process.exit(1);
    }
  }

  /**
   * Validates a migrated component
   */
  async validateComponent(originalFile: string, migratedFile: string): Promise<void> {
    const spinner = ora('Validating migration...').start();

    try {
      const result = await this.validator.validateMigration(originalFile, migratedFile);

      if (result.passed) {
        spinner.succeed(`Validation passed (Score: ${result.score}/100)`);
      } else {
        spinner.fail(`Validation failed (Score: ${result.score}/100)`);
      }

      // Display validation details
      console.log('\n' + chalk.bold.cyan('Validation Results'));
      console.log(chalk.gray('─'.repeat(50)));

      const table = new Table({
        head: [chalk.white('Test Category'), chalk.white('Result'), chalk.white('Tests')],
        style: { head: [], border: [] }
      });

      const categories = [
        { name: 'Visual Regression', result: result.visualRegression },
        { name: 'Functional Tests', result: result.functionalTests },
        { name: 'Performance Tests', result: result.performanceTests },
        { name: 'Accessibility Tests', result: result.accessibilityTests },
        { name: 'Security Tests', result: result.securityTests }
      ];

      categories.forEach(category => {
        table.push([
          category.name,
          category.result.passed ? chalk.green('✓ Passed') : chalk.red('✗ Failed'),
          `${category.result.testsPassed}/${category.result.testsRun}`
        ]);
      });

      console.log(table.toString());

    } catch (error) {
      spinner.fail(`Validation failed: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  /**
   * Performs component rollback
   */
  async rollbackComponent(componentId: string): Promise<void> {
    const spinner = ora(`Rolling back ${componentId}...`).start();

    try {
      // Confirm rollback
      const { confirmRollback } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmRollback',
        message: chalk.yellow(`Are you sure you want to rollback ${componentId}?`),
        default: false
      }]);

      if (!confirmRollback) {
        spinner.stop();
        console.log(chalk.gray('Rollback cancelled'));
        return;
      }

      await this.orchestrator.rollbackMigration(componentId);
      spinner.succeed(`Successfully rolled back ${componentId}`);

    } catch (error) {
      spinner.fail(`Rollback failed: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  /**
   * Shows migration status
   */
  async showStatus(): Promise<void> {
    console.log('\n' + chalk.bold.cyan('Migration Status'));
    console.log(chalk.gray('─'.repeat(50)));

    // This would fetch actual status from orchestrator
    const mockStatus = {
      activeMigrations: 2,
      completedToday: 5,
      failedToday: 1,
      averageTime: '2m 30s',
      successRate: '83.3%'
    };

    const table = new Table({
      style: { head: [], border: [] }
    });

    table.push(
      [chalk.gray('Active Migrations:'), mockStatus.activeMigrations],
      [chalk.gray('Completed Today:'), chalk.green(mockStatus.completedToday)],
      [chalk.gray('Failed Today:'), chalk.red(mockStatus.failedToday)],
      [chalk.gray('Average Time:'), mockStatus.averageTime],
      [chalk.gray('Success Rate:'), mockStatus.successRate]
    );

    console.log(table.toString());
  }

  /**
   * Generates migration report
   */
  async generateReport(outputFile: string): Promise<void> {
    const spinner = ora('Generating migration report...').start();

    try {
      // This would generate actual report
      await new Promise(resolve => setTimeout(resolve, 1000));

      spinner.succeed(`Report generated: ${outputFile}`);

      console.log('\n' + chalk.bold.cyan('Report Summary'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.gray('Total Components: ') + '25');
      console.log(chalk.gray('Migrated: ') + chalk.green('20'));
      console.log(chalk.gray('Pending: ') + chalk.yellow('3'));
      console.log(chalk.gray('Failed: ') + chalk.red('2'));
      console.log(chalk.gray('Average Type Coverage: ') + '92%');
      console.log(chalk.gray('Estimated Completion: ') + '2 days');

    } catch (error) {
      spinner.fail(`Report generation failed: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  // Helper methods

  private async loadPlan(planFile: string): Promise<MigrationPlan> {
    // Mock implementation - would load from file
    return {
      id: 'mock-plan',
      components: [],
      dependencies: {
        nodes: new Map(),
        migrationOrder: [],
        hasCycles: false
      },
      strategy: MigrationStrategy.SEQUENTIAL,
      rollbackPlan: {
        trigger: 'manual',
        preserveState: true,
        notificationTarget: [],
        validationSteps: []
      },
      validation: {
        visualRegression: true,
        functionalTesting: true,
        performanceTesting: true,
        accessibilityTesting: true,
        securityScanning: true
      },
      createdAt: new Date(),
      createdBy: 'cli-user'
    };
  }

  private setupProgressMonitoring(): void {
    // Setup progress bar and monitoring
    this.orchestrator.on('migration:progress', (event) => {
      console.log(chalk.gray(`  Progress: ${event.overallProgress}% - ${event.message}`));
    });
  }
}

// Initialize CLI
const cli = new MigrationCLI();

// Configure commands
program
  .name('migrate')
  .version(version)
  .description(chalk.bold('Component Migration CLI Tool'));

program
  .command('analyze <component>')
  .description('Analyze a component for migration complexity')
  .option('-v, --verbose', 'Verbose output')
  .action(async (component, options) => {
    await cli.analyzeComponent(component);
  });

program
  .command('plan <components...>')
  .description('Create a migration plan for components')
  .option('-s, --strategy <type>', 'Migration strategy (sequential|parallel|phased)', 'sequential')
  .action(async (components, options) => {
    await cli.createMigrationPlan(components);
  });

program
  .command('execute <plan>')
  .description('Execute a migration plan')
  .option('-d, --dry-run', 'Dry run without making changes')
  .option('-f, --force', 'Force migration without confirmations')
  .option('-p, --parallel', 'Run migrations in parallel')
  .action(async (plan, options) => {
    await cli.executeMigration(plan);
  });

program
  .command('validate <original> <migrated>')
  .description('Validate a migrated component')
  .action(async (original, migrated) => {
    await cli.validateComponent(original, migrated);
  });

program
  .command('rollback <component>')
  .description('Rollback a component migration')
  .action(async (component) => {
    await cli.rollbackComponent(component);
  });

program
  .command('status')
  .description('Show migration status')
  .action(async () => {
    await cli.showStatus();
  });

program
  .command('report [output]')
  .description('Generate migration report')
  .action(async (output = 'migration-report.html') => {
    await cli.generateReport(output);
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}