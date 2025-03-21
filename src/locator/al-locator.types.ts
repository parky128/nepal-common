/**
 *  AlLocatorService is responsible for abstracting the locations of a network of interrelated sites
 *  in different environments, regions/data residency zones, and data centers.  It is not meant to be
 *  used directly, but by a core library that exposes cross-application URL resolution in a more
 *  application-friendly way.
 *
 *  @author Kevin Nielsen <knielsen@alertlogic.com>
 *
 *  @copyright 2019 Alert Logic, Inc.
 */

/**
 * AlLocationContext defines the context in which a specific location or set of locations may exist.
 *     - environment - development, integration, production?
 *     - residency - US or EMEA (or default)?
 *     - insightLocationId - insight-us-virginia, insight-eu-ireland, defender-us-ashburn, defender-us-denver, defender-uk-newport
 *     - accessible - a list of accessible insight location IDs
 */
export interface AlLocationContext {
    environment?:string;
    residency?:string;
    insightLocationId?:string;
    accessible?:string[];
}

/**
 * AlLocationType is an enumeration of different location types, each corresponding to a specific application.
 * Each type is presumed to have a single unique instance inside a given environment and residency.
 */
/* tslint:disable:variable-name */
export class AlLocation
{
    /**
     * API Stacks
     */
    public static GlobalAPI         = "global:api";
    public static InsightAPI        = "insight:api";
    public static EndpointsAPI      = "endpoints:api";

    /**
     * Modern UI Nodes
     */
    public static LegacyUI          = "cd14:ui";
    public static OverviewUI        = "cd17:overview";
    public static IntelligenceUI    = "cd17:intelligence";
    public static ConfigurationUI   = "cd17:config";
    public static RemediationsUI    = "cd17:remediations";
    public static IncidentsUI       = "cd17:incidents";
    public static AccountsUI        = "cd17:accounts";
    public static LandscapeUI       = "cd17:landscape";
    public static IntegrationsUI    = "cd17:integrations";
    public static EndpointsUI       = "cd19:endpoints";
    public static InsightBI         = "insight:bi";
    public static HudUI             = "insight:hud";
    public static IrisUI            = "insight:iris";
    public static SearchUI          = "cd17:search";
    public static HealthUI          = "cd17:health";
    public static DisputesUI        = "cd17:disputes";
    public static DashboardsUI      = "cd19:dashboards";
    public static ExposuresUI       = "cd17:exposures";

    /**
     * Miscellaneous/External Resources
     */
    public static Fino              = "cd14:fino";
    public static SecurityContent   = "cd14:scc";
    public static SupportPortal     = "cd14:support";
    public static Segment           = "segment";
    public static Auth0             = "auth0";

    /**
     * Generates location type definitions for residency-specific prod, integration, and dev versions of a UI
     */
    public static uiNode( locTypeId:string, appCode:string, devPort:number ):AlLocationDescriptor[] {
        return [
            {
                locTypeId: locTypeId,
                environment: 'production',
                residency: 'US',
                uri: `https://console.${appCode}.alertlogic.com`
            },
            {
                locTypeId: locTypeId,
                environment: 'production',
                residency: 'EMEA',
                uri: `https://console.${appCode}.alertlogic.co.uk`
            },
            {
                locTypeId: locTypeId,
                environment: 'integration',
                uri: `https://console.${appCode}.product.dev.alertlogic.com`,
                aliases: [
                    `https://${appCode}.ui-dev.product.dev.alertlogic.com`,
                    `https://${appCode}-*.ui-dev.product.dev.alertlogic.com`,
                    `https://${appCode}-*-*.ui-dev.product.dev.alertlogic.com`,
                    `https://${appCode}-*-*-*.ui-dev.product.dev.alertlogic.com`,
                    `https://*.o3-${appCode}.product.dev.alertlogic.com`
                ]
            },
            {
                locTypeId: locTypeId,
                environment: 'development',
                uri: `http://localhost:${devPort}`
            }
        ];
    }
}

/**
 * Describes a single instance of a location type (AlLocation).
 */

export interface AlLocationDescriptor
{
    locTypeId:string;               //  This should correspond to one of the ALLocation string constants, e.g., AlLocation.AccountsUI or AlLocation.GlobalAPI.
    parentId?:string;               //  If the given node is a child of another node, this is the parent's ID
    insightLocationId?:string;      //  The location ID as defined by the global locations service -- e.g., 'defender-us-ashburn' or 'insight-eu-ireland'.
    uri:string;                     //  URI of the entity
    residency?:string;              //  A data residency domain
    environment?:string;            //  'production, 'integration', 'development'...
    aliases?:string[];              //  A list of

    productType?:string;            //  'defender' or 'insight' (others perhaps in the future?)
    aspect?:string;                 //  'ui' or 'api'

    uiCaption?:string;
    uiEntryPoint?:any;
    data?:any;                      //  Miscellaneous associated data

    _fullURI?:string;               //  Fully calculated URI of the node (for caching purposes)
}

/**
 * A dictionary of insight locations (as reported by AIMS and the locations service).
 */
export const AlInsightLocations: {[locationId:string]: ({residency: string; residencyCaption: string, alternatives?: string[]; logicalRegion: string});} =
{
    "defender-us-denver": {
        residency: "US",
        residencyCaption: "UNITED STATES",
        logicalRegion: "us-west-1"
    },
    "defender-us-ashburn": {
        residency: "US",
        residencyCaption: "UNITED STATES",
        logicalRegion: "us-east-1"
    },
    "defender-uk-newport": {
        residency: "EMEA",
        residencyCaption: "UNITED KINGDOM",
        logicalRegion: "uk-west-1"
    },
    "insight-us-virginia": {
        residency: "US",
        residencyCaption: "UNITED STATES",
        alternatives: [ "defender-us-denver", "defender-us-ashburn" ],
        logicalRegion: "us-east-1"
    },
    "insight-eu-ireland": {
        residency: "EMEA",
        residencyCaption: "UNITED KINGDOM",
        alternatives: [ "defender-uk-newport" ],
        logicalRegion: "uk-west-1"
    }
};

export class AlLocatorMatrix
{
    protected actingUri:string|null = null;
    protected actor:AlLocationDescriptor|null = null;

    protected uriMap:{[pattern:string]:{matcher:RegExp,location:AlLocationDescriptor}} = {};
    protected nodes:{[locTypeId:string]:AlLocationDescriptor} = {};
    protected _nodeMap:{[hashKey:string]:AlLocationDescriptor} = {};

    protected context:AlLocationContext = {
        environment:        "production",
        residency:          "US",
        insightLocationId:  undefined,
        accessible:         undefined
    };


    constructor( nodes:AlLocationDescriptor[] = [], actingUri:string|boolean = true, context?:AlLocationContext ) {
        if ( context ) {
            this.setContext( context );
        }
        if ( nodes && nodes.length ) {
            this.setLocations( nodes );
        }
        if ( typeof( actingUri ) === 'boolean' || actingUri ) {
            this.setActingUri( actingUri );
        }
    }

    /**
     * Arguably the only important general-purpose functionality of this service.
     * Calculates a URL from a location identifier, an optional path fragment, and an optional context.
     */
    public resolveURL( locTypeId:string, path?:string, context?:AlLocationContext ) {
        const loc = this.getNode( locTypeId, context );
        let url:string;
        if ( loc ) {
            url = this.resolveNodeURI( loc );
        } else {
            if ( typeof( window ) !== 'undefined' ) {
                url = window.location.origin + ( ( window.location.pathname && window.location.pathname.length > 1 ) ? window.location.pathname : '' );
            } else {
                url = "http://localhost:9999";
            }
        }
        if ( path ) {
            url += path;        //  wow, that `const` keyword is so useful!  except not.
        }
        return url;
    }

    /**
     *  Resolves a literal URI to a service node.
     */
    public getNodeByURI( targetURI:string ):AlLocationDescriptor|null {
        for ( let k in this.uriMap ) {
            const mapping = this.uriMap[k];
            if ( mapping.matcher.test( targetURI ) ) {
                let baseUrl = this.getBaseUrl( targetURI );
                if ( baseUrl !== mapping.location.uri ) {
                    mapping.location.uri = baseUrl;
                    mapping.location._fullURI = baseUrl;     // Use this specific base URL for resolving other links to this application type
                    console.log(`Notice: using [${baseUrl}] as a base URI for location type '${mapping.location.locTypeId}'`);
                }
                return mapping.location;
            }
        }
        return null;
    }

    /**
     *  Gets the currently acting node.
     */
    public getActingNode():AlLocationDescriptor|null {
        return this.actor;
    }

    /**
     *  Recursively resolves the URI of a service node.
     */
    public resolveNodeURI( node:AlLocationDescriptor, context?:AlLocationContext ):string {
        if ( node._fullURI ) {
            return node._fullURI;
        }
        let uri = '';
        if ( node.parentId ) {
            const parentNode = this.getNode( node.parentId, context );
            if(parentNode) {
                uri += this.resolveNodeURI( parentNode, context );
            }
        }
        if ( node.uri ) {
            uri += node.uri;
            if ( ! node.parentId ) {
                //  For historical reasons, some nodes (like auth0) are represented without protocols (e.g., alertlogic-integration.auth0.com instead of https://alertlogic-integration.auth0.com).
                //  For the purposes of resolving functional links, detect these protocolless domains and add the default https:// protocol to them.
                if ( uri.indexOf("http") !== 0 ) {
                    uri = "https://" + uri;
                }
            }
        }
        node._fullURI = uri;
        return uri;
    }

    /**
     *  Updates the service matrix model with a set of service node descriptors.  Optionally
     *  calculates which node is the acting node based on its URI.
     *
     *  @param {Array} nodes A list of service node descriptors.
     */
    public setLocations( nodes:AlLocationDescriptor[] ) {

        if ( nodes ) {
            for ( let i = 0; i < nodes.length; i++ ) {
                this.saveNode( nodes[i] );
            }
        }
    }

    public setActingUri( actingUri:string|boolean ) {
        if ( actingUri === null ) {
            this.actingUri = null;
            this.actor = null;
            return;
        }

        if ( typeof( actingUri ) === 'boolean' ) {
            if ( typeof( window ) !== 'undefined' ) {
                actingUri = window.location.origin + ( ( window.location.pathname && window.location.pathname.length > 1 ) ? window.location.pathname : '' );
            } else {
                actingUri = "http://localhost:9999";
            }
        }
        /**
         *  This particular piece of black magic is responsible for identifying the active node by its URI
         *  and updating the ambient context to match its environment and data residency attributes.  It is
         *  opaque for a reason :)
         */
        if ( actingUri ) {
            this.actingUri = actingUri;
            this.actor = this.getNodeByURI( actingUri );
            if ( this.actor ) {
                this.setContext( {
                    environment: this.actor.environment || this.context.environment,
                    residency: this.actor.residency || this.context.residency
                } );
            }
        }
    }

    public search( filter:{(node:AlLocationDescriptor):boolean} ):AlLocationDescriptor[] {
        let results = [];
        for ( let k in this._nodeMap ) {
            if ( ! this._nodeMap.hasOwnProperty( k ) ) {
                continue;
            }
            if ( filter( this._nodeMap[k] ) ) {
                results.push( this._nodeMap[k] );
            }
        }

        return results;
    }

    public findOne( filter:{(node:AlLocationDescriptor):boolean} ):AlLocationDescriptor|null {
        let results = this.search( filter );
        if ( results.length === 0 ) {
            return null;
        }
        return results[0];
    }

    /**
     *  Sets the acting context (preferred environment, data residency, location attributes).
     *  This acts as a merge against existing context, so the caller can provide only fragmentary information without borking things.
     */
    public setContext( context?:AlLocationContext ) {
        this.nodes = {};    //  flush lookup cache
        this.context.insightLocationId = context && context.insightLocationId ? context.insightLocationId : this.context.insightLocationId;
        this.context.accessible = context && context.accessible && context.accessible.length ? context.accessible : this.context.accessible;
        if ( this.context.insightLocationId ) {
            let locationNode = this.findOne( n => { return n.insightLocationId === this.context.insightLocationId; } );
            if ( locationNode && locationNode.residency ) {
                this.context.residency = locationNode.residency;
            }
            //  This block defaults to setting contextual residency to match the bound location.
        }
        this.context.environment = context && context.environment ? context.environment : this.context.environment;
        this.context.residency = context && context.residency ? context.residency : this.context.residency;
        this.normalizeContext();
    }

    public getContext():AlLocationContext {
        return this.context;
    }

    /**
     *  Gets a service node by ID, optionally using a context to refine its selection logic.  The context defaults
     *  to the service matrix instance's current context; if the default is used, the result of the lookup will be stored
     *  for performance optimization.
     *
     *  @param {string} locTypeId The ID of the service node to select.  See al-service-identity.ts for constant values.
     *  @param {AlLocationContext} context Additional context to shape the selection logic.
     *
     *  @returns {AlLocationDescriptor} A node descriptor (or null, if no node matches).
     */
    public getNode( locTypeId:string, context?:AlLocationContext ):AlLocationDescriptor|null {
        if ( this.nodes.hasOwnProperty( locTypeId ) && !context ) {
            return this.nodes[locTypeId];
        }
        let environment = context && context.environment ? context.environment : this.context.environment;
        let residency = context && context.residency ? context.residency : this.context.residency;
        let insightLocationId = context && context.insightLocationId ? context.insightLocationId : this.context.insightLocationId;
        let accessible = context && context.accessible ? context.accessible : this.context.accessible;
        let node = null;

        if ( insightLocationId ) {
            if ( this._nodeMap.hasOwnProperty( `${locTypeId}-${environment}-${residency}-${insightLocationId}` ) ) {
                node = this._nodeMap[`${locTypeId}-${environment}-${residency}-${insightLocationId}`];
            }
        }

        if ( ! node && accessible && accessible.length ) {
            for ( let i = 0; i < accessible.length; i++ ) {
                let accessibleLocationId = accessible[i];
                if ( accessibleLocationId !== insightLocationId ) {
                    if ( this._nodeMap.hasOwnProperty( `${locTypeId}-${environment}-${residency}-${accessibleLocationId}` ) ) {
                        node = this._nodeMap[`${locTypeId}-${environment}-${residency}-${accessibleLocationId}`];
                    }
                }
            }
        }
        if ( ! node && environment && residency && this._nodeMap.hasOwnProperty( `${locTypeId}-${environment}-${residency}`) ) {
            node = this._nodeMap[`${locTypeId}-${environment}-${residency}`];
        }
        if ( ! node && environment && this._nodeMap.hasOwnProperty( `${locTypeId}-${environment}-*`) ) {
            node = this._nodeMap[`${locTypeId}-${environment}-*`];
        }
        if ( ! node && this._nodeMap.hasOwnProperty( `${locTypeId}-*-*`) ) {
            node = this._nodeMap[`${locTypeId}-*-*`];
        }
        if ( node && ! context ) {
            //  Save it in a dictionary for faster lookup next time
            this.nodes[locTypeId] = node;
        }

        return node;
    }

    /**
     *  Saves a node (including hash lookups).
     */
    protected saveNode( node:AlLocationDescriptor ) {
        if ( node.environment && node.residency ) {
            if ( node.insightLocationId ) {
                this._nodeMap[`${node.locTypeId}-${node.environment}-${node.residency}-${node.insightLocationId}`] = node;
            }
            this._nodeMap[`${node.locTypeId}-${node.environment}-${node.residency}`] = node;
        }
        if ( node.environment ) {
            this._nodeMap[`${node.locTypeId}-${node.environment}-*`] = node;
        }
        this._nodeMap[`${node.locTypeId}-*-*`] = node;
        this.addUriMapping( node );
    }

    /**
     * Adds pattern maches for a node's domain and domain aliases, so that URLs can be easily and efficiently mapped back to their nodes
     */
    protected addUriMapping( node:AlLocationDescriptor ) {
        let pattern:string;

        if ( typeof( node.uri ) === 'string' && node.uri.length > 0 ) {
            let pattern = this.escapeLocationPattern( node.uri );
            this.uriMap[pattern] = { matcher: new RegExp( pattern ), location: node };
        }
        if ( node.aliases ) {
            node.aliases.map( alias => {
                pattern = this.escapeLocationPattern( alias );
                this.uriMap[pattern] = { matcher: new RegExp( pattern ), location: node };
            } );
        }
    }

    /**
     * Escapes a domain pattern.
     *
     * All normal regex characters are escaped; * is converted to [a-zA-Z0-9_]+; and the whole expression is wrapped in ^....*$.
     */
    protected escapeLocationPattern( uri:string ):string {
        let pattern = "^" + uri.replace(/[-\/\\^$.()|[\]{}]/g, '\\$&');     //  escape all regexp characters except *, add anchor
        pattern = pattern.replace( /\*/, "[a-zA-Z0-9_]+" );                 //  convert * wildcard into group match with 1 or more characters
        pattern += ".*$";                                                   //  add filler and terminus anchor
        return pattern;
    }

    /**
     * Chops off fragments, query strings, and any trailing slashes, and returns what *should* be just the base URL.
     * I make no promises about the quality of this code when confronted with incorrect or incomplete inputs.
     */
    protected getBaseUrl( uri:string ):string {
        if ( uri.indexOf("#") !== -1 ) {
            uri = uri.substring( 0, uri.indexOf("#") );
        }
        if ( uri.indexOf("?") !== -1 ) {
            uri = uri.substring( 0, uri.indexOf("?" ) );
        }
        if ( uri.length > 0 && uri[uri.length-1] === '/' ) {
            uri = uri.substring( 0, uri.length - 1 );
        }
        return uri;
    }

    /**
     * This method normalizes the current context.  In practice, this means mapping an insight location ID to the correct defender datacenter.
     * In other words, it is "black magic."  Or at least, dark gray.
     */
    protected normalizeContext() {
        if ( ! this.context.insightLocationId || ! this.context.accessible ) {
            return;
        }
        if ( ! AlInsightLocations.hasOwnProperty( this.context.insightLocationId ) ) {
            return;
        }
        const insightLocation = AlInsightLocations[this.context.insightLocationId];
        if ( insightLocation.alternatives ) {
            let selected = null;
            for ( let i = 0; i < insightLocation.alternatives.length; i++ ) {
                let candidateLocationId = insightLocation.alternatives[i];
                if ( this.context.accessible.indexOf( candidateLocationId ) !== -1 ) {
                    selected = candidateLocationId;
                    break;
                }
            }
            if ( selected === null ) {
                selected = insightLocation.alternatives[0];
            }
            console.log(`Notice: treating insight location '%s' as '%s'`, this.context.insightLocationId, selected );       //  logging because this has historically been a point of great confusion
            this.context.insightLocationId = selected;
        }
        if ( insightLocation.residency && this.context.residency !== insightLocation.residency ) {
            //  Location IDs have higher specificity than residency settings, so given defender-uk-newport and residency: US, the residency should be overridden to reflect EMEA.
            this.context.residency = insightLocation.residency;
        }
    }
}
