import {Guid} from '../guid';
import {DOM} from '../dom';
import {EventDispatcher, NoArgs, Event} from '../eventdispatcher';
import {UIInstanceManager} from '../uimanager';

/**
 * Base configuration interface for a component.
 * Should be extended by components that want to add additional configuration options.
 */
export interface ComponentConfig {
  /**
   * The HTML tag name of the component.
   * Default: 'div'
   */
  tag?: string;
  /**
   * The HTML ID of the component.
   * Default: automatically generated with pattern 'ui-id-{guid}'.
   */
  id?: string;

  /**
   * A prefix to prepend all CSS classes with.
   */
  cssPrefix?: string;

  /**
   * The CSS classes of the component. This is usually the class from where the component takes its styling.
   */
  cssClass?: string; // 'class' is a reserved keyword, so we need to make the name more complicated

  /**
   * Additional CSS classes of the component.
   */
  cssClasses?: string[];

  /**
   * Specifies if the component should be hidden at startup.
   * Default: false
   */
  hidden?: boolean;
}

/**
 * The base class of the UI framework.
 * Each component must extend this class and optionally the config interface.
 */
export class Component<Config extends ComponentConfig> {

  /**
   * The classname that is attached to the element when it is in the hidden state.
   * @type {string}
   */
  private static readonly CLASS_HIDDEN = 'hidden';

  /**
   * Configuration object of this component.
   */
  protected config: Config;

  /**
   * The component's DOM element.
   */
  private element: DOM;

  /**
   * Flag that keeps track of the hidden state.
   */
  private hidden: boolean;

  /**
   * The list of events that this component offers. These events should always be private and only directly
   * accessed from within the implementing component.
   *
   * Because TypeScript does not support private properties with the same name on different class hierarchy levels
   * (i.e. superclass and subclass cannot contain a private property with the same name), the default naming
   * convention for the event list of a component that should be followed by subclasses is the concatenation of the
   * camel-cased class name + 'Events' (e.g. SubClass extends Component => subClassEvents).
   * See {@link #componentEvents} for an example.
   *
   * Event properties should be named in camel case with an 'on' prefix and in the present tense. Async events may
   * have a start event (when the operation starts) in the present tense, and must have an end event (when the
   * operation ends) in the past tense (or present tense in special cases (e.g. onStart/onStarted or onPlay/onPlaying).
   * See {@link #componentEvents#onShow} for an example.
   *
   * Each event should be accompanied with a protected method named by the convention eventName + 'Event'
   * (e.g. onStartEvent), that actually triggers the event by calling {@link EventDispatcher#dispatch dispatch} and
   * passing a reference to the component as first parameter. Components should always trigger their events with these
   * methods. Implementing this pattern gives subclasses means to directly listen to the events by overriding the
   * method (and saving the overhead of passing a handler to the event dispatcher) and more importantly to trigger
   * these events without having access to the private event list.
   * See {@link #onShow} for an example.
   *
   * To provide external code the possibility to listen to this component's events (subscribe, unsubscribe, etc.),
   * each event should also be accompanied by a public getter function with the same name as the event's property,
   * that returns the {@link Event} obtained from the event dispatcher by calling {@link EventDispatcher#getEvent}.
   * See {@link #onShow} for an example.
   *
   * Full example for an event representing an example action in a example component:
   *
   * <code>
   * // Define an example component class with an example event
   * class ExampleComponent extends Component<ComponentConfig> {
     *
     *     private exampleComponentEvents = {
     *         onExampleAction: new EventDispatcher<ExampleComponent, NoArgs>()
     *     }
     *
     *     // constructor and other stuff...
     *
     *     protected onExampleActionEvent() {
     *        this.exampleComponentEvents.onExampleAction.dispatch(this);
     *    }
     *
     *    get onExampleAction(): Event<ExampleComponent, NoArgs> {
     *        return this.exampleComponentEvents.onExampleAction.getEvent();
     *    }
     * }
   *
   * // Create an instance of the component somewhere
   * var exampleComponentInstance = new ExampleComponent();
   *
   * // Subscribe to the example event on the component
   * exampleComponentInstance.onExampleAction.subscribe(function (sender: ExampleComponent) {
     *     console.log('onExampleAction of ' + sender + ' has fired!');
     * });
   * </code>
   */
  private componentEvents = {
    onShow: new EventDispatcher<Component<Config>, NoArgs>(),
    onHide: new EventDispatcher<Component<Config>, NoArgs>()
  };

  /**
   * Constructs a component with an optionally supplied config. All subclasses must call the constructor of their
   * superclass and then merge their configuration into the component's configuration.
   * @param config the configuration for the component
   */
  constructor(config: ComponentConfig = {}) {
    // Create the configuration for this component
    this.config = <Config>this.mergeConfig(config, {
      tag: 'div',
      id: 'bmpui-id-' + Guid.next(),
      cssPrefix: 'bmpui',
      cssClass: 'ui-component',
      cssClasses: [],
      hidden: false
    }, {});
  }

  /**
   * Initializes the component, e.g. by applying config settings.
   * This method must not be called from outside the UI framework.
   *
   * This method is automatically called by the {@link UIInstanceManager}. If the component is an inner component of
   * some component, and thus encapsulated abd managed internally and never directly exposed to the UIManager,
   * this method must be called from the managing component's {@link #initialize} method.
   */
  initialize(): void {
    this.hidden = this.config.hidden;

    // Hide the component at initialization if it is configured to be hidden
    if (this.isHidden()) {
      this.hide();
    }
  }

  /**
   * Configures the component for the supplied Player and UIInstanceManager. This is the place where all the magic
   * happens, where components typically subscribe and react to events (on their DOM element, the Player, or the
   * UIInstanceManager), and basically everything that makes them interactive.
   * This method is called only once, when the UIManager initializes the UI.
   *
   * Subclasses usually overwrite this method to add their own functionality.
   *
   * @param player the player which this component controls
   * @param uimanager the UIInstanceManager that manages this component
   */
  configure(player: bitmovin.player.Player, uimanager: UIInstanceManager): void {
    let self = this;

    self.onShow.subscribe(function() {
      uimanager.onComponentShow.dispatch(self);
    });
    self.onHide.subscribe(function() {
      uimanager.onComponentHide.dispatch(self);
    });
  }

  /**
   * Generate the DOM element for this component.
   *
   * Subclasses usually overwrite this method to extend or replace the DOM element with their own design.
   */
  protected toDomElement(): DOM {
    let element = new DOM(this.config.tag, {
      'id': this.config.id,
      'class': this.getCssClasses()
    });
    return element;
  }

  /**
   * Returns the DOM element of this component. Creates the DOM element if it does not yet exist.
   *
   * Should not be overwritten by subclasses.
   *
   * @returns {DOM}
   */
  getDomElement(): DOM {
    if (!this.element) {
      this.element = this.toDomElement();
    }

    return this.element;
  }

  /**
   * Merges a configuration with a default configuration and a base configuration from the superclass.
   *
   * @param config the configuration settings for the components, as usually passed to the constructor
   * @param defaults a default configuration for settings that are not passed with the configuration
   * @param base configuration inherited from a superclass
   * @returns {Config}
   */
  protected mergeConfig<Config>(config: Config, defaults: Config, base: Config): Config {
    // Extend default config with supplied config
    let merged = Object.assign({}, base, defaults, config);

    // Return the extended config
    return merged;
  }

  /**
   * Helper method that returns a string of all CSS classes of the component.
   *
   * @returns {string}
   */
  protected getCssClasses(): string {
    let self = this;
    // Merge all CSS classes into single array
    let flattenedArray = [this.config.cssClass].concat(this.config.cssClasses);
    // Prefix classes
    flattenedArray = flattenedArray.map(function(css) {
      return self.prefixCss(css);
    });
    // Join array values into a string
    let flattenedString = flattenedArray.join(' ');
    // Return trimmed string to prevent whitespace at the end from the join operation
    return flattenedString.trim();
  }

  protected prefixCss(cssClassOrId: string): string {
    return this.config.cssPrefix + '-' + cssClassOrId;
  }

  /**
   * Returns the configuration object of the component.
   * @returns {Config}
   */
  public getConfig(): Config {
    return this.config;
  }

  /**
   * Hides the component.
   * This method basically transfers the component into the hidden state. Actual hiding is done via CSS.
   */
  hide() {
    this.hidden = true;
    this.getDomElement().addClass(this.prefixCss(Component.CLASS_HIDDEN));
    this.onHideEvent();
  }

  /**
   * Shows the component.
   */
  show() {
    this.getDomElement().removeClass(this.prefixCss(Component.CLASS_HIDDEN));
    this.hidden = false;
    this.onShowEvent();
  }

  /**
   * Determines if the component is hidden.
   * @returns {boolean} true if the component is hidden, else false
   */
  isHidden(): boolean {
    return this.hidden;
  }

  /**
   * Determines if the component is shown.
   * @returns {boolean} true if the component is visible, else false
   */
  isShown(): boolean {
    return !this.isHidden();
  }

  /**
   * Toggles the hidden state by hiding the component if it is shown, or showing it if hidden.
   */
  toggleHidden() {
    if (this.isHidden()) {
      this.show();
    } else {
      this.hide();
    }
  }

  /**
   * Fires the onShow event.
   * See the detailed explanation on event architecture onj the {@link #componentEvents events list}.
   */
  protected onShowEvent() {
    this.componentEvents.onShow.dispatch(this);
  }

  /**
   * Fires the onHide event.
   * See the detailed explanation on event architecture onj the {@link #componentEvents events list}.
   */
  protected onHideEvent() {
    this.componentEvents.onHide.dispatch(this);
  }

  /**
   * Gets the event that is fired when the component is showing.
   * See the detailed explanation on event architecture onj the {@link #componentEvents events list}.
   * @returns {Event<Component<Config>, NoArgs>}
   */
  get onShow(): Event<Component<Config>, NoArgs> {
    return this.componentEvents.onShow.getEvent();
  }

  /**
   * Gets the event that is fired when the component is hiding.
   * See the detailed explanation on event architecture onj the {@link #componentEvents events list}.
   * @returns {Event<Component<Config>, NoArgs>}
   */
  get onHide(): Event<Component<Config>, NoArgs> {
    return this.componentEvents.onHide.getEvent();
  }
}