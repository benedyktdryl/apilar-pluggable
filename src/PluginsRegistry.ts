import { Plugin } from './Plugin';

const STAGES_NOT_EQUAL_COMPARATOR = (stageA: string, stageB: string) => stageA !== stageB;
const STAGES_EQUAL_COMPARATOR = (stageA: string, stageB: string) => stageA === stageB;

export enum Stages {
  Configuration = 'Configuration',
  PluginsInitialisation = 'PluginsInitialisation',
  Ready = 'Ready'
}

export interface Item {
  [key: string]: any;
}

export interface ExtensionPoint {
  items: Item[];
  handler: (item: Item) => Item;
}

export type ExtensionPointsList = string[];

export class PluginsRegistry {
  private plugins = new Map();
  private stage: Stages = Stages.Configuration;
  private extensionPoints: Map<string, ExtensionPoint> = new Map();

  private static log(...args: any[]) {
    if (process.env.NODE_ENV === 'development') {
      /* tslint:disable no-console */
      console.log(...args);
    }
  }

  private get pluginsList() {
    return Array.from(this.plugins.values());
  }

  private assertStage(stage: Stages, methodName: string, comparator = STAGES_NOT_EQUAL_COMPARATOR) {
    if (comparator(this.stage, stage)) {
      throw Error(`Executing "${methodName}" in "${stage}" stage is forbidden`);
    }
  }

  private assertExtensionPointExits(name: string, shouldThrow = true) {
    PluginsRegistry.log('assertExtensionPointExits', name);

    if (!this.extensionPoints.has(name)) {
      throw new Error(`No extension point with name "${name}"`);
    }
  }

  private assertPluginNotRegistred(name: string) {
    if (this.plugins.has(name)) {
      throw new Error(`Plugin with name "${name}" already registered`);
    }
  }

  public attachToExtensionPoint(name: string, item: any) {
    PluginsRegistry.log('attachToExtensionPoint', name);

    this.assertStage(Stages.PluginsInitialisation, 'attachToExtensionPoint');
    this.assertExtensionPointExits(name);

    (this.extensionPoints.get(name) as ExtensionPoint).items.push(item);
  }

  public registerExtensionPoint(name: string, handler = (item: Item): Item => item) {
    PluginsRegistry.log('registerExtensionPoint', name);

    this.assertStage(Stages.Ready, 'registerExtensionPoint', STAGES_EQUAL_COMPARATOR);

    if (!this.extensionPoints.has(name)) {
      this.extensionPoints.set(name, { items: [], handler });
    }
  }

  public registerPlugin(plugin: Plugin) {
    PluginsRegistry.log('registerPlugin', plugin.pluginName);

    this.assertStage(Stages.Configuration, 'registerPlugin');
    this.assertPluginNotRegistred(plugin.pluginName);

    this.plugins.set(plugin.pluginName, plugin);
  }

  /**
   * For now it's simply returning items registred under given extension point
   */
  public applyExtensionPoint(name: string) {
    PluginsRegistry.log('applyExtensionPoint', name);

    try {
      this.assertExtensionPointExits(name);
    } catch (error) {
      return null;
    }

    const { items, handler } = this.extensionPoints.get(name) as ExtensionPoint;

    return items.map(handler);
  }

  private pluginInitialise = async (plugin: Plugin) => {
    PluginsRegistry.log('pluginInitialise', plugin.pluginName);

    plugin.state = new Promise(async (resolve, reject) => {
      /**
       * Target plugin initialisation state. We are returning it from method,
       * so parent method will know when execution ends, but also atatching it to plugin itself,
       * so plugins which depends on it will know when dependant plugin is ready.
       *
       * Initialize plugin if dependencies are intialized
       * and pass pluginsRegistry instance into so it can attach new extension points.
       */
      await Promise.all(
        /**
         * Grab all dependendant plugins by it names and initialize them first
         */
        plugin.requires
          .map(dependencyName => this.plugins.get(dependencyName))

          /**
           * If plugin already have initialisation metadata,
           * just pass it to get parent plugin knows about
           * dependant plugin initialisation state, otherwise, initialise plugin.
           *
           * @todo check if dependant plugin exist, skip if not
           */
          .map(
            dependantPlugin => (dependantPlugin.state ? dependantPlugin.state : this.pluginInitialise(dependantPlugin))
          )
      );

      resolve(plugin.init(this));
    });

    /**
     * Return initialisation state so top level call will signalise initialisation finish
     */
    return plugin.state;
  };

  private notifyPluginOnInitFinish = (plugin: Plugin) => {
    if (plugin.onRegistryInitFinish) {
      plugin.onRegistryInitFinish(this);
    }
  };

  public async init() {
    /**
     * After plugins will register extension points, changes stage to initialisation
     * so plugin can't change extension points during initialisation
     */
    this.stage = Stages.PluginsInitialisation;

    /**
     * Run top level initialisation of plugins with maximum concurency.
     * Subsequent plugins will be initialised as dependencies.
     */
    await Promise.all(this.pluginsList.map(this.pluginInitialise));

    /**
     * Inform plugins about finished initialisation
     */
    this.pluginsList.map(this.notifyPluginOnInitFinish);

    this.stage = Stages.Ready;
  }
}
