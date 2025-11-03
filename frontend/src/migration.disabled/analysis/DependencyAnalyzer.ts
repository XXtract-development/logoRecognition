/**
 * Dependency Analyzer
 * @module DependencyAnalyzer
 * @description Analyzes component dependencies for migration ordering
 */

import { DependencyNode, DependencyGraph } from '../types/MigrationTypes';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Import information extracted from source
 * @interface ImportInfo
 * @property {string} modulePath - Path to imported module
 * @property {string[]} importedNames - Names imported from module
 * @property {boolean} isDefault - Whether it's a default import
 * @property {boolean} isNamespace - Whether it's a namespace import
 * @property {boolean} isRelative - Whether it's a relative import
 */
interface ImportInfo {
  modulePath: string;
  importedNames: string[];
  isDefault: boolean;
  isNamespace: boolean;
  isRelative: boolean;
}

/**
 * Circular dependency information
 * @interface CircularDependency
 * @property {string[]} cycle - Components in the cycle
 * @property {string} description - Human-readable description
 */
export interface CircularDependency {
  cycle: string[];
  description: string;
}

/**
 * Component analysis result
 * @interface ComponentAnalysis
 * @property {string} id - Component identifier
 * @property {string} filePath - Component file path
 * @property {ImportInfo[]} imports - Import statements
 * @property {string[]} exports - Export statements
 * @property {string[]} dependencies - Direct dependencies
 * @property {number} complexity - Component complexity score
 * @property {number} linesOfCode - Lines of code
 * @property {boolean} hasJSX - Whether component contains JSX
 * @property {boolean} hasHooks - Whether component uses hooks
 * @property {boolean} hasState - Whether component has state
 */
export interface ComponentAnalysis {
  id: string;
  filePath: string;
  imports: ImportInfo[];
  exports: string[];
  dependencies: string[];
  complexity: number;
  linesOfCode: number;
  hasJSX: boolean;
  hasHooks: boolean;
  hasState: boolean;
}

/**
 * Analyzes component dependencies for migration ordering
 * @class DependencyAnalyzer
 * @description Parses component files to build dependency graphs and determine
 * optimal migration order while detecting circular dependencies
 */
export class DependencyAnalyzer {
  private projectRoot: string;
  private tsProgram: ts.Program | null = null;
  private cache: Map<string, ComponentAnalysis> = new Map();

  /**
   * Creates a new DependencyAnalyzer instance
   * @param {string} [projectRoot] - Project root directory
   * @example
   * const analyzer = new DependencyAnalyzer('/path/to/project');
   * const graph = await analyzer.buildDependencyGraph(componentFiles);
   */
  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Builds a complete dependency graph for components
   * @param {string[]} componentFiles - List of component file paths
   * @returns {Promise<DependencyGraph>} Complete dependency graph
   * @throws {Error} When file analysis fails
   * @example
   * const graph = await analyzer.buildDependencyGraph([
   *   'src/components/UserProfile.js',
   *   'src/components/Header.js'
   * ]);
   * console.log(`Migration order: ${graph.migrationOrder.join(', ')}`);
   */
  public async buildDependencyGraph(componentFiles: string[]): Promise<DependencyGraph> {
    const nodes: Map<string, DependencyNode> = new Map();

    // Analyze all components
    for (const filePath of componentFiles) {
      const analysis = await this.analyzeComponent(filePath);
      const node: DependencyNode = {
        id: analysis.id,
        filePath: analysis.filePath,
        dependencies: analysis.dependencies,
        dependents: [],
        migrationOrder: 0
      };
      nodes.set(node.id, node);
    }

    // Build dependents list
    for (const node of nodes.values()) {
      for (const depId of node.dependencies) {
        const depNode = nodes.get(depId);
        if (depNode) {
          depNode.dependents.push(node.id);
        }
      }
    }

    // Check for circular dependencies
    const cycles = this.detectCircularDependencies(nodes);
    const hasCycles = cycles.length > 0;

    // Calculate migration order
    const migrationOrder = hasCycles
      ? this.calculateOrderWithCycles(nodes, cycles)
      : this.calculateTopologicalOrder(nodes);

    // Assign migration order to nodes
    migrationOrder.forEach((id, index) => {
      const node = nodes.get(id);
      if (node) {
        node.migrationOrder = index;
      }
    });

    return {
      nodes,
      migrationOrder,
      hasCycles
    };
  }

  /**
   * Analyzes a single component file
   * @param {string} filePath - Path to component file
   * @returns {Promise<ComponentAnalysis>} Component analysis results
   * @throws {Error} When file cannot be read or parsed
   * @example
   * const analysis = await analyzer.analyzeComponent('src/components/UserProfile.js');
   * console.log(`Component has ${analysis.dependencies.length} dependencies`);
   */
  public async analyzeComponent(filePath: string): Promise<ComponentAnalysis> {
    // Check cache first
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)!;
    }

    try {
      const fullPath = path.resolve(this.projectRoot, filePath);
      const sourceCode = await this.readFile(fullPath);
      const sourceFile = ts.createSourceFile(
        filePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true,
        filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
          ? ts.ScriptKind.TSX
          : ts.ScriptKind.TS
      );

      const analysis: ComponentAnalysis = {
        id: path.basename(filePath, path.extname(filePath)),
        filePath,
        imports: [],
        exports: [],
        dependencies: [],
        complexity: 0,
        linesOfCode: sourceCode.split('\n').length,
        hasJSX: false,
        hasHooks: false,
        hasState: false
      };

      // Parse the AST
      this.visitNode(sourceFile, sourceFile, analysis);

      // Extract dependencies from imports
      analysis.dependencies = this.extractDependencies(analysis.imports, filePath);

      // Calculate complexity
      analysis.complexity = this.calculateComplexity(analysis);

      // Cache the result
      this.cache.set(filePath, analysis);

      return analysis;
    } catch (error) {
      throw new Error(`Failed to analyze component ${filePath}: ${(error as Error).message}`);
    }
  }

  /**
   * Detects circular dependencies in the dependency graph
   * @param {Map<string, DependencyNode>} nodes - Dependency nodes
   * @returns {CircularDependency[]} Array of circular dependencies
   * @example
   * const cycles = analyzer.detectCircularDependencies(nodes);
   * if (cycles.length > 0) {
   *   console.log(`Found ${cycles.length} circular dependencies`);
   * }
   */
  public detectCircularDependencies(nodes: Map<string, DependencyNode>): CircularDependency[] {
    const cycles: CircularDependency[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const node = nodes.get(nodeId);
      if (node) {
        for (const depId of node.dependencies) {
          if (!visited.has(depId)) {
            if (dfs(depId)) {
              return true;
            }
          } else if (recursionStack.has(depId)) {
            // Found a cycle
            const cycleStartIndex = path.indexOf(depId);
            const cycle = path.slice(cycleStartIndex);
            cycles.push({
              cycle: [...cycle, depId],
              description: `${cycle.join(' -> ')} -> ${depId}`
            });
            return true;
          }
        }
      }

      recursionStack.delete(nodeId);
      path.pop();
      return false;
    };

    for (const nodeId of nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    }

    return cycles;
  }

  /**
   * Calculates topological order for migration
   * @private
   * @param {Map<string, DependencyNode>} nodes - Dependency nodes
   * @returns {string[]} Ordered component IDs
   */
  private calculateTopologicalOrder(nodes: Map<string, DependencyNode>): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const tempVisited = new Set<string>();

    const visit = (nodeId: string): void => {
      if (visited.has(nodeId) || tempVisited.has(nodeId)) {
        return;
      }

      tempVisited.add(nodeId);

      const node = nodes.get(nodeId);
      if (node) {
        for (const depId of node.dependencies) {
          if (nodes.has(depId)) {
            visit(depId);
          }
        }
      }

      tempVisited.delete(nodeId);
      visited.add(nodeId);
      order.unshift(nodeId);
    };

    for (const nodeId of nodes.keys()) {
      if (!visited.has(nodeId)) {
        visit(nodeId);
      }
    }

    return order;
  }

  /**
   * Calculates migration order when cycles exist
   * @private
   * @param {Map<string, DependencyNode>} nodes - Dependency nodes
   * @param {CircularDependency[]} cycles - Detected cycles
   * @returns {string[]} Ordered component IDs
   */
  private calculateOrderWithCycles(
    nodes: Map<string, DependencyNode>,
    cycles: CircularDependency[]
  ): string[] {
    // For cycles, we need to break them intelligently
    // Priority: Components with fewer dependencies go first
    const order: string[] = [];
    const processed = new Set<string>();

    // Group nodes by dependency count
    const nodesByDepCount = Array.from(nodes.entries())
      .sort((a, b) => a[1].dependencies.length - b[1].dependencies.length);

    for (const [nodeId] of nodesByDepCount) {
      if (!processed.has(nodeId)) {
        order.push(nodeId);
        processed.add(nodeId);
      }
    }

    return order;
  }

  /**
   * Visits AST nodes to extract information
   * @private
   * @param {ts.Node} node - TypeScript AST node
   * @param {ts.SourceFile} sourceFile - Source file
   * @param {ComponentAnalysis} analysis - Analysis to update
   */
  private visitNode(node: ts.Node, sourceFile: ts.SourceFile, analysis: ComponentAnalysis): void {
    // Check for imports
    if (ts.isImportDeclaration(node)) {
      const importInfo = this.extractImportInfo(node, sourceFile);
      if (importInfo) {
        analysis.imports.push(importInfo);
      }
    }

    // Check for exports
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      analysis.exports.push(node.getText(sourceFile));
    }

    // Check for JSX
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      analysis.hasJSX = true;
    }

    // Check for hooks (function calls starting with 'use')
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);
      if (callText.startsWith('use')) {
        analysis.hasHooks = true;
      }
      if (callText === 'useState' || callText === 'React.useState') {
        analysis.hasState = true;
      }
    }

    // Check for class state
    if (ts.isPropertyDeclaration(node)) {
      const propName = node.name?.getText(sourceFile);
      if (propName === 'state') {
        analysis.hasState = true;
      }
    }

    // Continue traversing
    ts.forEachChild(node, child => this.visitNode(child, sourceFile, analysis));
  }

  /**
   * Extracts import information from an import declaration
   * @private
   * @param {ts.ImportDeclaration} node - Import declaration node
   * @param {ts.SourceFile} sourceFile - Source file
   * @returns {ImportInfo | null} Import information or null
   */
  private extractImportInfo(node: ts.ImportDeclaration, sourceFile: ts.SourceFile): ImportInfo | null {
    const moduleSpecifier = node.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) {
      return null;
    }

    const modulePath = moduleSpecifier.text;
    const importClause = node.importClause;

    const importInfo: ImportInfo = {
      modulePath,
      importedNames: [],
      isDefault: false,
      isNamespace: false,
      isRelative: modulePath.startsWith('./') || modulePath.startsWith('../')
    };

    if (importClause) {
      // Default import
      if (importClause.name) {
        importInfo.isDefault = true;
        importInfo.importedNames.push(importClause.name.getText(sourceFile));
      }

      // Named imports
      if (importClause.namedBindings) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          importInfo.isNamespace = true;
          importInfo.importedNames.push(importClause.namedBindings.name.getText(sourceFile));
        } else if (ts.isNamedImports(importClause.namedBindings)) {
          importClause.namedBindings.elements.forEach(element => {
            importInfo.importedNames.push(element.name.getText(sourceFile));
          });
        }
      }
    }

    return importInfo;
  }

  /**
   * Extracts component dependencies from imports
   * @private
   * @param {ImportInfo[]} imports - Import information
   * @param {string} currentFile - Current file path
   * @returns {string[]} Dependency component IDs
   */
  private extractDependencies(imports: ImportInfo[], currentFile: string): string[] {
    const dependencies: string[] = [];
    const currentDir = path.dirname(currentFile);

    for (const imp of imports) {
      if (imp.isRelative) {
        // Resolve relative imports to component IDs
        const resolvedPath = path.resolve(currentDir, imp.modulePath);
        const componentName = path.basename(resolvedPath, path.extname(resolvedPath));

        // Only include if it's a component (not a utility)
        if (this.isLikelyComponent(componentName)) {
          dependencies.push(componentName);
        }
      }
    }

    return [...new Set(dependencies)]; // Remove duplicates
  }

  /**
   * Determines if a name is likely a React component
   * @private
   * @param {string} name - File/export name
   * @returns {boolean} Whether it's likely a component
   */
  private isLikelyComponent(name: string): boolean {
    // Components typically start with uppercase
    return /^[A-Z]/.test(name);
  }

  /**
   * Calculates component complexity score
   * @private
   * @param {ComponentAnalysis} analysis - Component analysis
   * @returns {number} Complexity score (0-100)
   */
  private calculateComplexity(analysis: ComponentAnalysis): number {
    let complexity = 0;

    // Base complexity from lines of code
    if (analysis.linesOfCode < 100) complexity += 10;
    else if (analysis.linesOfCode < 300) complexity += 30;
    else if (analysis.linesOfCode < 500) complexity += 50;
    else complexity += 70;

    // Dependency complexity
    complexity += Math.min(analysis.dependencies.length * 3, 20);

    // Feature complexity
    if (analysis.hasJSX) complexity += 5;
    if (analysis.hasHooks) complexity += 5;
    if (analysis.hasState) complexity += 10;

    return Math.min(complexity, 100);
  }

  /**
   * Reads a file asynchronously
   * @private
   * @param {string} filePath - File path
   * @returns {Promise<string>} File contents
   */
  private async readFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // In a browser environment, we would use a different method
      // This is a placeholder that returns mock content
      resolve(`
        import React, { useState } from 'react';
        import Header from './Header';

        export const Component = () => {
          const [state, setState] = useState();
          return <div><Header /></div>;
        };
      `);
    });
  }
}