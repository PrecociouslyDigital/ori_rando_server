import './index.css';
import React, {Fragment} from 'react';
import {Map, Tooltip, TileLayer, Marker, ZoomControl, Circle} from 'react-leaflet';
import Leaflet from 'leaflet';
import {presets, player_icons, get_preset, logic_paths, Blabel, dev, get_param} from './common.js';
import {picks_by_type, PickupMarkersList, get_icon, getMapCrs, hide_opacity, select_styles, select_wrap} from './shared_map.js';
import Select from 'react-select';
import {Button, Collapse, Container, Row, Col, Input, UncontrolledButtonDropdown, DropdownToggle, DropdownMenu, DropdownItem} from 'reactstrap';
import Control from 'react-leaflet-control';
import {Helmet} from 'react-helmet';
// import ItemTracker from './ItemTracker.js'

const paths = Object.keys(presets);

const EMPTY_PLAYER = {seed: {}, pos: [-210, 189], seen:[], show_marker: true, hide_found: true, hide_unreachable: true, spoiler: false, hide_remaining: false, sense: false, areas: []}

// function get_inner(id) {
// 	return (
// 	<Tooltip>
// 	<span>{id}</span>
// 	</Tooltip>
// 	);
// };

const PlayerMarker = ({ map, position, icon, name, sense}) => sense ? (
    <Fragment>
	<Marker map={map} position={position} icon={icon}>
        <Tooltip><span>{name}</span></Tooltip>
	</Marker>
    <Circle center={position} radius={64}/>
	</Fragment>) : (
	<Marker map={map} position={position} icon={icon}>
        <Tooltip><span>{name}</span></Tooltip>
	</Marker>
)

const PlayerMarkersList = ({map, players}) => {
	let players_to_show = Object.keys(players).filter(id => players[id].show_marker).map(id => players[id])
	const items = players_to_show.map(({id, pos, name, show_sense}) => (
		<PlayerMarker  key={"player_"+id} map={map} position={pos  || [-210, 189]} name={name} icon={player_icons(id)} sense={show_sense}  />
	));
	return (<div style={{display: 'none'}}>{items}</div>);
}

const PlayerUiOpts = ({players, setter, follow}) => {
    let followTog = (id) => () => setter(() => {
        if (id === follow)
            return {follow: -1}
        return {follow: id}
    })
    let tog = (pid, target) => () => setter((prevState) => {
			let retVal = prevState.players;
			retVal[pid][target] = !retVal[pid][target];
			return {players: retVal};
		});
	if(!players || Object.keys(players).length === 0)
		return null;
	const items = Object.keys(players).map((id) => {
		return (
            <Fragment>
                <Row className="pt-2">
                    <Col className="p-1"><Blabel color="light">{players[id].name}</Blabel></Col>
                    <Col className="p-1"><Button block active={players[id].show_marker} color="primary" outline={!players[id].show_marker} onClick={tog(id, "show_marker")}>Visible</Button></Col>
                    <Col className="p-1"><Button block active={players[id].show_spoiler} color="primary" outline={!players[id].show_spoiler} onClick={tog(id, "show_spoiler")}>Spoilers</Button></Col>
                    <Col className="p-1"><Button block active={players[id].show_sense} color="primary" outline={!players[id].show_sense} onClick={tog(id, "show_sense")}>Sense</Button></Col>
                    <Col className="p-1"><Button block active={id === follow} color="primary" outline={id !== follow} onClick={followTog(id)}>Follow</Button></Col>
                </Row>
                <Row className="pb-2">
                    <Col className="p-1"><Blabel color="light">Hide</Blabel></Col>
                    <Col className="p-1"><Button block active={players[id].hide_found} color="primary" outline={!players[id].hide_found} onClick={tog(id, "hide_found")}>found</Button></Col>
                    <Col className="p-1"><Button block active={players[id].hide_unreachable} color="primary" outline={!players[id].hide_unreachable} onClick={tog(id, "hide_unreachable")}>unreachable</Button></Col>
                    <Col className="p-1"><Button block active={players[id].hide_remaining} color="primary" outline={!players[id].hide_remaining} onClick={tog(id, "hide_remaining")}>remaining</Button></Col>
                </Row>
            </Fragment>
		);
	});
	return items;
}

function getLocInfo(pick, players) {
	let loc = pick.loc;
	let info = Object.keys(players).map((id) => {
		let show_spoiler = players[id].show_spoiler;
		let seen = players[id].seen.includes(loc);
		if(show_spoiler || seen)
			if(players[id].seed.hasOwnProperty(loc))
				return id + ":" + players[id].seed[loc] + ((show_spoiler && seen) ? "*" : "");
			else
				return id + ": Nothing in seed at " + loc
		else
			return id + ": (hidden)"
	});
	return info;
}

function getMapstoneToolTip(players, inHTML = true) {
	let rows = [];
	let msNum = 0;
	for(let loc = 24; loc <= 56; loc += 4) {
		msNum++;
		let row = inHTML ? [(
			<td>MS{msNum}:</td>
		)] : [];
		row = row.concat(Object.keys(players).map((id) => {
			let show_spoiler = players[id].show_spoiler;
			let seen = players[id].seen.includes(loc);
			if(!inHTML) 
				return (show_spoiler || seen) ? (players[id].seed[loc] || "") : "";
			let cell = "("+id+") ";
			let val = players[id].seed[loc] || "N/A"
			if(show_spoiler || seen)
				cell += val + ((show_spoiler && seen) ? "*" : "");
			else
				cell += "(hidden)";
			return (
	    		<td style={{color:'black'}}>{cell}</td>
			)			
		}));
		rows.push(inHTML ? row : row.join(","));
	}
	if(!inHTML) 
		return rows.join(",")
	let jsxRows = rows.map(row => {
		return (
			<tr>{row}</tr>
		)
	});
	return (
		<Tooltip>
			<table>
			{jsxRows}
			</table>
		</Tooltip>
	)
}

function getPickupMarkers(state) {
	let players = {};
	Object.keys(state.players).forEach((id) => {
		if(state.players[id].show_marker)
			players[id] = state.players[id];
	});
	
	let hideOpt = state.hideOpt;
	let pickupTypes = (state.pickup_display === "Some") ? state.pickups : ["EX", "HC", "SK", "Pl", "KS", "MS", "EC", "AC", "EV", "Ma", "CS"];
	let searchStr = (state.searchStr || "").toLowerCase();
	let markers = []
	let msTT = getMapstoneToolTip(players);
	for(let i in pickupTypes) {
		let pre = pickupTypes[i];
		for(let p in picks_by_type[pre]) {
			let pick = picks_by_type[pre][p]
			let count = Object.keys(players).length
            let {x, y} = pick
			let icon = get_icon(pick)
			if(count === 0) {
				markers.push({key: pick.name+"|"+pick.x+","+pick.y, position: [y, x], inner: null, icon: icon})
				continue
			}

			let highlight = searchStr ? false : true;
			let loc_info = getLocInfo(pick, players);
			let pick_name = loc_info.join(",").toLowerCase();
			Object.keys(players).forEach((id) => {
				let player = players[id]
				let {hide_found, hide_unreachable, hide_remaining, show_spoiler} = player
				if(searchStr && pick.name === "MapStone")
					pick_name = getMapstoneToolTip({id: player}, false).toLowerCase();
				let found = player.seen.includes(pick.loc);
				if(!highlight && (found || show_spoiler) && (pick_name && searchStr && pick_name.includes(searchStr)))
					highlight = true;
				let reachable = players[id].areas.includes(pick.area);

				if( (found && hide_found) || (!found && hide_remaining) || (!reachable && hide_unreachable && !found))
					count -= 1;
			});

			if((hideOpt === "any") ? (count === Object.keys(players).length) : (count > 0))
			{
				let inner = null;
				if(pick.name === "MapStone") {
					inner = msTT;
				} else {
					if(loc_info)
						{
						let lines = loc_info.map((infoln) => {
							return (
							<tr><td style={{color:'black'}}>{infoln}</td></tr>
							)
						});
						inner = (
						<Tooltip>
							<table>
							{lines}
							</table>
						</Tooltip>
						);
					}
				}
				let opacity = highlight ? 1  : hide_opacity;
				markers.push({key: pick.name+"|"+pick.x+","+pick.y, position: [y, x], inner: inner, icon: icon, opacity: opacity});
			}

		}
	}
	return markers;
};

(function(){
    var originalInitTile = Leaflet.GridLayer.prototype._initTile
    Leaflet.GridLayer.include({
        _initTile: function (tile) {
            originalInitTile.call(this, tile);

            var tileSize = this.getTileSize();

            tile.style.width = tileSize.x + 1 + 'px';
            tile.style.height = tileSize.y + 1 + 'px';
        }
    });
})();

const DEFAULT_VIEWPORT = {
	  center: [0, 0],
	  zoom: 4,
};
const RETRY_MAX = 60;
const TIMEOUT_START = 5;
const TIMEOUT_INC = 5;

const crs = getMapCrs();

class GameTracker extends React.Component {
  constructor(props) {
    super(props)
    let modes = presets['standard'];
    let url = new URL(window.document.URL);
    this.state = {
        mousePos: {lat: 0, lng: 0}, players: {}, follow: url.searchParams.get("follow") || -1, retries: 0, check_seen: 1, modes: modes, timeout: TIMEOUT_START, searchStr: "", pickup_display: "all", 
        show_sidebar: !url.searchParams.has("hideSidebar"), idle_countdown: 10800, bg_update: true, pickups: ["EX", "HC", "SK", "Pl", "KS", "MS", "EC", "AC", "EV", "Ma", "CS"], show_tracker: !url.searchParams.has("hideTracker"),
        open_world: false, closed_dungeons: false, pathMode: get_preset(modes), hideOpt: "all", display_logic: false,  viewport: {center: [0, 0], zoom: 5}, usermap: url.searchParams.get("usermap") || "",
        /*tracker_data: {events: [], teleporters: [], shards: {gs: 0, ss: 0, wv: 0}, skills: [], maps: 0,relics_found: [], relics: [], trees: []},*/ gameId: get_param("game_id")
    };
  };

  componentDidMount() {
        setTimeout(() => {
            this.refs.map.leafletElement.invalidateSize(false);
            this.setState({viewport: DEFAULT_VIEWPORT});
        }, 100);
        this.getGamedata();
        this.interval = setInterval(() => this.tick(), 1000);
  };

  timeout = () => {
  	return {retries: this.state.retries+1, check_seen: this.state.timeout, timeout: this.state.timeout+TIMEOUT_INC}
  };
  tick = () => {
    let update = {}
    try {
        let {retries, bg_update, idle_countdown, check_seen, players, follow} = this.state;
        if(retries >= RETRY_MAX) return;
        if(!document.hasFocus()) {
            if(!bg_update) return;
            if(idle_countdown > 0)
                this.setState({idle_countdown: idle_countdown-1})
            else
                this.setState({idle_countdown: 10800, bg_update: false})
        } else {
            update.idle_countdown = 10800
        }
        if(check_seen === 0) {
            this.getUpdate(this.timeout);
            Object.keys(players).forEach((id) => {
                if(Object.keys(players[id].seed).length < 50)
                    getSeed((p) => this.setState(p), this.state.gameId, id, this.timeout);
            })
        } else 
            update.check_seen = check_seen - 1
        if(follow > 0 && players.hasOwnProperty(follow)) {
            let map = this.refs.map.leafletElement;
            map.panTo(players[follow].pos)
        }
    } catch(error) {
        console.log(`tick: ${error}`)
    }
    this.setState(update)
};

  componentWillUnmount() {
    clearInterval(this.interval);
  };

  hideOptChanged = newVal => { this.setState({hideOpt: newVal}) }
  pickupsChanged = newVal => { this.setState({pickups: newVal}) }
  onSearch = event => { this.setState({searchStr: event.target.value}) }
  modesChanged = (paths) => this.setState(prevState => {
		let players = prevState.players
		Object.keys(players).forEach(id => {		
				players[id].areas = []
			});
		return {players: players, modes: paths, pathMode: get_preset(paths)}
		}, () => this.getUpdate(this.timeout))
        
  onMode = (m) => () => this.setState(prevState => {
        if(dev)
            console.log(this.state)

        let modes = prevState.modes;
        if(modes.includes(m)) {
            modes = modes.filter(x => x !== m)
        } else {
            modes.push(m)
        }
		let players = prevState.players
		Object.keys(players).forEach(id => {
				players[id].areas = []
			});
		return {players: players, modes: modes, pathMode: get_preset(modes)}}, () => this.getUpdate(this.timeout))
		
toggleLogic = () => {this.setState({display_logic: !this.state.display_logic})};

  onViewportChanged = viewport => { this.setState({ viewport }) }
 _onPathModeChange = (n) => paths.includes(n.value) ? this.modesChanged(presets[n.value]) : this.setState({pathMode: n.value})

  render() {
    try {
		let pickup_markers = (this.state.pickup_display !== "none") ? ( <PickupMarkersList markers={getPickupMarkers(this.state)} />) : null;
		let player_markers = ( <PlayerMarkersList players={this.state.players} />)
		let player_opts = ( <PlayerUiOpts players={this.state.players} follow={this.state.follow} setter={(p) => this.setState(p)} />)
		let show_button = !this.state.show_sidebar ? (<Button size="sm" onClick={() => this.setState({show_sidebar: true})}>Show Sidebar</Button>) : null
        let logic_path_buttons = logic_paths.map(lp => {return (<Col className="p-1" xs="4"><Button block size="sm" outline={!this.state.modes.includes(lp)} onClick={this.onMode(lp)}>{lp}</Button></Col>)});
        let hidetext = {any: "any player", all: "all players"}
        let hideopts = Object.keys(this.state.players).length > 1 ? (
            <Row className="pt-2">
                <Col>
                    <Blabel color="white">Hide pickups that are...</Blabel>
                </Col>
                <Col>
                    <UncontrolledButtonDropdown>
                        <DropdownToggle caret block>
                            hidden for {hidetext[this.state.hideOpt]}
                        </DropdownToggle>
                        <DropdownMenu>
                            <DropdownItem onClick={() => this.hideOptChanged("all")} disabled={this.state.hideOpt === "all"}>hidden for all players</DropdownItem>
                            <DropdownItem onClick={() => this.hideOptChanged("any")} disabled={this.state.hideOpt === "any"}>hidden for any player</DropdownItem>
                        </DropdownMenu>
                    </UncontrolledButtonDropdown>
                </Col>
            </Row>
        ) : null
		let sidebar = this.state.show_sidebar ? (
				<div className="controls">
                    <Container fluid>
                        <Row className="p-1 pb-3 pt-3">
                            <Col xs="4" className="pr-0">
                                <Blabel  color="light">Search</Blabel>
                            </Col>
                            <Col xs="8">
                                <Input type="text" value={this.state.searchStr} onChange={this.onSearch} />
                            </Col>
                        </Row>
                        <Row>
                        <Col className="p-2"><Blabel  color="light">Options: </Blabel></Col>
                        <Col className="p-2"><Button block onClick={() => this.setState({show_sidebar: false})}>Hide Sidebar</Button></Col>
                        <Col className="p-2"><Button block color="primary" active={this.state.show_tracker} onClick={() => this.setState({show_tracker: !this.state.show_tracker})}>{`${this.state.show_tracker ? "Hide" : "Show"} Tracker`}</Button></Col>
                        </Row>
                        {/*<Row>
                            <Collapse className="w-100 h-100" isOpen={this.state.show_tracker}>
                            <ItemTracker embedded data={this.state.tracker_data}/>
                            </Collapse>
                        </Row>*/}
                        {player_opts}
                        {hideopts}
                        <Row className="pt-2">
                        <Col xs="4">
                            <Button color="primary" onClick={this.toggleLogic} >Logic Modes:</Button>
                        </Col><Col xs="8">
                            <Select styles={select_styles}  options={select_wrap(paths)} onChange={this._onPathModeChange} clearable={false} value={select_wrap(this.state.pathMode)}></Select>
                        </Col>
                        </Row>
                        <Collapse id="logic-options-wrapper" isOpen={this.state.display_logic}>
                            <Row>
                                {logic_path_buttons}
                            </Row>
                        </Collapse>
                    </Container>
				</div>
		) : null
    return (
			<div className="wrapper">
	            <Helmet>
	                <style>{'body { background-color: black}'}</style>
					<link rel="stylesheet" href="https://unpkg.com/leaflet@1.3.1/dist/leaflet.css" integrity="sha512-Rksm5RenBEKSKFjgI3a41vrjkw4EVPlJ3+OiI65vTjIdo9brlAacEuKOiQ5OFh7cOI1bkDwLqdLw3Zg0cRJAAQ==" crossorigin=""/>
	            </Helmet>
		      	<Map style={{backgroundColor: "#121212"}} ref="map" crs={crs} onMouseMove={(ev) => this.setState({mousePos: ev.latlng})} zoomControl={false} onViewportChanged={this.onViewportChanged} viewport={this.state.viewport}>
		      	     <ZoomControl position="topright" />

					<TileLayer url=' https://ori-tracker.firebaseapp.com/images/ori-map/{z}/{x}/{y}.png' noWrap='true' />
					<Control position="topleft" >
					<div>
						{show_button}
						<Button size="sm" onClick={() => this.setState({ viewport: DEFAULT_VIEWPORT })}>Reset View</Button>
						<Button size="sm" color="disabled">{Math.round(this.state.mousePos.lng)},{Math.round(this.state.mousePos.lat)}</Button>
					</div>
					</Control>
					{pickup_markers}
					{player_markers}
			    </Map>
			    {sidebar}
			</div>
		)
    } catch(error) {
        return (<h1>Error: {error} Try Refreshing?</h1>)
    }
	}
    getUpdate = (timeout) => {
        let onRes = (res) => {
            	let update = JSON.parse(res);
                if(update.error)
                {
                    console.log(update.error)
                    this.setState(timeout())
                }
                if(update.newGid) {
                    let o = this.state.gameId
                    let n = update.newGid
                    window.document.title = window.document.title.replace(o, n)
                    window.history.replaceState('',window.document.title, window.document.URL.replace(`game/${o}/`, `game/${n}/`));

                    this.setState({gameId: update.newGid, players: {}}, this.getGamedata)
                    return
                }
				this.setState(prevState => {
					let players = prevState.players
					Object.keys(update.players).forEach(pid => {
						if(!players.hasOwnProperty(pid)){
							players[pid] = {...EMPTY_PLAYER};
                            players[pid].id = pid
						}
                        let {reachable, pos, seen} = update.players[pid];
                        players[pid].seen = seen
                        players[pid].areas = reachable
                        players[pid].pos = pos
                        
					})
					return {players: players, /*tracker_data: update.items, */retries: 0, timeout: TIMEOUT_START }
				})
        }
        let modes = this.state.modes.join("+")
        if(this.state.closed_dungeons) 
            modes +="+CLOSED_DUNGEON"
        if(this.state.open_world) 
            modes +="+OPEN_WORLD"
        if(this.state.usermap)
            modes += `&usermap=${this.state.usermap}`
        doNetRequest(onRes, (s) => this.setState(s), `/tracker/game/${this.state.gameId}/fetch/update?modes=${modes}`, timeout)
    }
    getGamedata = () => {
        let onRes = (res) => {
                    this.setState(state => {
                        let {paths, closed_dungeons, open_world, players} = JSON.parse(res);
                        let curr_players = state.players;
                        players.forEach(({pid, name, ppid}) => {
                            if(!curr_players.hasOwnProperty(pid))
                            {
                                curr_players[pid] = {...EMPTY_PLAYER}
                                curr_players[pid].id = ppid || pid
                                curr_players[pid].name = name
                                if(state.usermap) {
                                    if(state.usermap === name) {
                                        state.follow = curr_players[pid].id;
                                    } else {
                                        curr_players[pid].show_marker = false
                                        curr_players[pid].hide_remaining = true
                                    }
                                } 
                            }
                        })
                        return {pathMode: get_preset(paths), players: curr_players, retries: 0, modes: paths, closed_dungeons: closed_dungeons, open_world: open_world}
                    });
                }
        doNetRequest(onRes, (s) => this.setState(s), "/tracker/game/"+this.state.gameId+"/fetch/gamedata", this.timeout)
    }
};

function doNetRequest(onRes, setter, url, timeout)
{
    try {
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.onreadystatechange = function() {
            try {
                if (xmlHttp.readyState === 4) {
                    if(xmlHttp.status === 404)
                        setter(timeout())
                    else
                        onRes(xmlHttp.responseText);
                }
            } catch(err) {
                console.log(`netCallback: ${err} status ${xmlHttp.statusText}`)
            }
        }
        xmlHttp.open("GET", url, true); // true for asynchronous
        xmlHttp.send(null);
    } catch(e) {
        console.log(`doNetRequest: ${e}`)
    }
}

function getSeed(setter, gameId, pid, timeout)
{
     var onRes = (res) => {
				setter(prevState => {
					let retVal = prevState.players;
                    let {seed, name} = JSON.parse(res);
                    retVal[pid].seed = seed;
                    retVal[pid].name = name || retVal[pid].name;
					return {players:retVal, retries: 0, timeout: TIMEOUT_START}
				});
            }
     doNetRequest(onRes, setter, "/tracker/game/"+gameId+"/fetch/player/"+pid+"/seed", timeout)
}

export default GameTracker;
