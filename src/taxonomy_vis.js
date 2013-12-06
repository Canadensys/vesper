// Tree

VESPER.Tree = function(divid) {

    var self = this;

	var svg;	// top level svg
	var treeG; // matrix rectangle (i.e. not the axes)
	
	var dims;

    var absRoot;
    var curRoot;
    var spaceAlloc;
    var layout;
	var curSort;

    var thisView;
    var model;

    var ffields;

    var zoomObj = d3.behavior.zoom();	// zoom object, need to keep as we reference it later. calling d3.behavior.zoom() again gets us a different object/function
    zoomObj.scaleExtent ([1.0, 4.0]); // constrain zooming

    var exitDur = 400, updateDur = 1000, enterDur = 400;
    var keyField, rankField;
    var firstLayout = true;
    var color = d3.scale.category20c();
    var colourScale = d3.scale.linear().domain([0, 1]).range(["#ffcccc", "#ff6666"]);
    var cstore = {}, pstore = {};

    var allowedRanks = {"superroot": true, "ROOT": true, "FAM": true, "ORD": true, "ABT": true, "KLA": true, "GAT": true, "SPE": true};
	var sortOptions = {
		"Alpha": function (a,b) { var n1 = model.getLabel(a); var n2 = model.getLabel(b);
								return ( n1 < n2 ) ? -1 : ( n1 > n2 ? 1 : 0 );},
		"Descendants": function (a,b) { var s1 = model.getDescendantCount(a); var s2 = model.getDescendantCount(b);
										//VESPER.log (s1,s2);
										if (s1 === undefined && s2 === undefined) {
											var sp1 = model.getSpecimens(a);
											s1 = sp1 ? sp1.length : 0;
											var sp2 = model.getSpecimens(b);
											s2 = sp2 ? sp2.length : 0;
										}
										s1 = s1 || 0;
										s2 = s2 || 0;
										return s1 > s2 ? 1 : ((s1 < s2) ? -1 : 0);
		},
        "Selected": function (a,b) {
            var sModel = model.getSelectionModel();
            //console.log (a,b);
            var sel1 = sModel.contains(model.getIndexedDataPoint (a,keyField));
            var sel2 = sModel.contains(model.getIndexedDataPoint (b,keyField));
            return (sel1 === sel2) ? 0 :  (sel1 === true ? 1 : -1);
        },
        "Selected Desc": function (a,b) {
            var sModel = model.getSelectionModel();
            //console.log (a,b);
            var sel1 = a.sdcount;
            var sel2 = b.sdcount
            return (sel1 === sel2) ? 0 :  (sel1 === undefined ? -1 : (sel2 === undefined ? 1 : (sel1 - sel2)));
        }
	};

    function tooltipString (node, model) {
        var specs = model.getSpecimens(node);
        var desc = model.getDescendantCount(node);
        var sdesc = model.getSelectedDescendantCount(node);
        var subt = model.getSubTaxa(node);

        var tooltipStr = "";

        for (var n = 0; n < ffields.length; n++) {
            tooltipStr += ((n > 0) ? "<br>" : "")+ffields[n].fieldType+": "+model.getIndexedDataPoint (node, ffields[n]);
        }

        tooltipStr += (subt === undefined ?
                (specs ? "<hr>"+specs.length+" specimens" : "")
                : "<hr>"+desc+" descendants")
            + (sdesc > 0 ?
                (subt === undefined ?
                (specs ? "<br>"+sdesc+" selected specimens" : "")
                : "<br>"+sdesc+" selected descendants")
            : "")
        ;

        var syn = model.getSynonyms(node);
        if (syn) {
            tooltipStr += "<hr><i>Synonymy</i>";
            for (var n = 0; n < syn.length; n++) {
               tooltipStr += "<br>" + model.getIndexedDataPoint(syn[n], keyField)+": "+model.getLabel (syn[n]);
            }
        }

        return tooltipStr;
    }


    var spaceAllocationOptions = {
        bottomUp: AdaptedD3.bottomUp()
            .sort (null)
            //.value(function(d) { return 1; })// having a value for err value, makes the layout append .value fields to each node, needed when doing bottom-up layouts
            .value(function(d) { return model.getLeafValue (d); }) // having a value for err value, makes the layout append .value fields to each node, needed when doing bottom-up layouts
            .children (function (d) { return model.getSubTaxa(d); })
            .nodeId (function (d) { return model.getIndexedDataPoint (d,keyField); })
        ,

        bottomUpLog: AdaptedD3.logPartition()
            .sort (null)
            .value (function(d) { return model.getLeafValue (d); })
            .children (function (d) { return model.getSubTaxa(d); })
            .nodeId (function (d) { return model.getIndexedDataPoint (d,keyField); })
        ,

        topDown: AdaptedD3.topDown()
            .sort (null)
            .value (null)
            .children (function (d) { return model.getSubTaxa(d); })
            .nodeId (function (d) { return model.getIndexedDataPoint (d,keyField); })
           // .filter (function (d) { return allowedRanks[model.getTaxaData(d)[rankField]]; })
    };


    var partitionLayout = {

        cutoffVal: 4,

        sizeBounds: function () {
            return [dims[1], dims[0]];
        },

        booleanSelectedAttrs: function (group) {
            group
                .attr ("class", function(d) { /* var node = getNode (d.id);*/ return model.getSelectionModel().contains(d.id) ? "selected" : "unselected"; })
                .attr ("y", function (d) { return d.x; })
                .attr ("x", function (d) { return d.y; })
                .attr("width", function (d) { return d.dy; })
                .attr("height", function (d) { return d.dx; })
            ;
        },

        widthLogFunc: function (d) {
            var node = getNode (d.id);
            var prop = node.sdcount > 0 && node.dcount > 0 ? Math.log (node.sdcount + 1) / Math.log (node.dcount + 1) : 0;
            return prop * d.dy;
        },

        xFunc: function (d) {
            var node = getNode (d.id);
            var prop = node.sdcount > 0 && node.dcount > 0 ? Math.log (node.sdcount + 1) / Math.log (node.dcount + 1) : 0;
            return d.y + ((1.0 - prop) * d.dy);
        },

        propSharedAttrs: function (group, xFunc, widthFunc) {
            group
                .attr ("class", "holdsSelected")
                .attr ("y", function (d) { return d.x; })
                .attr ("x", xFunc)
                .attr("height", function (d) { return d.dx; })
                .attr("width", widthFunc)
            ;
        },

        sharedTextAttrs: function (sel) {
            function rotate (d, elem) {
                return d.dx > d.dy && d3.select(elem).node().getComputedTextLength() < d.dx - 4;
            }

            sel
                .attr ("transform", function (d) {
                return "translate ("+ (d.y)+","+(d.x + Math.max (((d.dx - 14) / 2) + 14, 14))+")"
                    + " rotate ("+(rotate(d, this) ? 90 : 0)+" "+(d.dy/2)+" 0)"
                    //: "rotate (0 0,0)"
                    ;
                })
                .attr ("clip-path", function (d) { var node = getNode (d.id) /*d*/; return rotate(d, this) ? null : "url(#depthclip0)"; /*"url(#depthclip"+node.depth+")";*/})
            ;
        },

        prep: function (coordSet) {
            treeG.attr("transform", "translate(0,0)");
            partitionLayout.makeTextClips (coordSet);
        },

        removeOld: function (exitSel) {
            clearMouseController (exitSel);
            NapVisLib.d3fadeAndRemoveGroups ([exitSel], exitDur, 0);
        },

        makeNew: function (enterSel) {
            var newNodes = enterSel
                .append ("svg:g")
                .attr("class", "treeNode")
                .style("opacity", 0)
                .call (mouseController)
            ;

            newNodes.append ("svg:rect")
                .style ("visibility", function (d) { return d.dx >= partitionLayout.cutoffVal ? "visible": "hidden"; })
                .call (partitionLayout.booleanSelectedAttrs)
                //.call (mouseController)
            ;


            newNodes.append ("svg:rect")
                .style ("visibility", function (d) { return d.dx >= partitionLayout.cutoffVal ? "visible": "hidden"; })
                .style ("opacity", 0.75)
                .call (partitionLayout.propSharedAttrs, this.xFunc, this.widthLogFunc)
                //.call (mouseController)
            ;


            newNodes.append ("svg:text")
                .text (function(d) { var node = getNode (d.id) /*d*/; return model.getLabel(node); })
                .style ("visibility", function (d) { return d.dx > 15 && d.dy > 15 ? "visible": "hidden"; })
                .call (partitionLayout.sharedTextAttrs)
                //.attr ("clip-path", function (d) { var node = getNode (d.id) /*d*/; return "url(#depthclip"+node.depth+")"; })
            ;

            return newNodes;
        },

        redrawExistingNodes: function (group, delay) {
            group.select("rect:not(.holdsSelected)")
                .style ("visibility", function (d) { return d.dx >= partitionLayout.cutoffVal ? "visible": "hidden"; })
                .transition()
                .delay (delay)
                .duration (updateDur)
                .call (partitionLayout.booleanSelectedAttrs)
            ;

            group.select("rect.holdsSelected")
                .style ("visibility", function (d) { return d.dx >= partitionLayout.cutoffVal ? "visible": "hidden"; })
                .transition()
                .delay (delay)
                .duration (updateDur)
                .call (partitionLayout.propSharedAttrs, this.xFunc, this.widthLogFunc)
            ;

            group.select("text")
                .style ("visibility", function (d) { return d.dx > 15 && d.dy > 15 ? "visible": "hidden"; })
                //.attr ("clip-path", function (d) { var node = getNode (d.id) /*d*/; return "url(#depthclip"+node.depth+")"; })
                .transition()
                .delay (delay)
                .duration (updateDur)
                .call (partitionLayout.sharedTextAttrs)
            ;
        },

        makeTextClips: function (viewableNodes) {
            var height = svg.node().getBoundingClientRect().height;
            var depths = [];
            for (var n = 0; n < viewableNodes.length; n++) {
                var coord = viewableNodes[n];
                var node = getNode (coord.id);
                if (!depths [node.depth]) {
                    // right, right, right. Because these are text clips I have to offset the clips so they actually show the text
                    // that's what the -20 on y is doing
                    depths [node.depth] = {depth: node.depth, x: coord.y, y: -20, width: coord.dy, height: height + 20}; // y/x swap - horizontal icicle remember
                    //depths [node.depth] = {depth: node.depth, x: node.cd[1], y: 0, width: node.cd[3], height: height}; // y/x swap - horizontal icicle remember
                }
            }
            //VESPER.log ("depths", depths);

            // aaargh, webkit has a bug that means camelcase elements can't be selected
            // which meant I spent a fruitless morning trying to select "clipPath" elements.
            // Instead you have to add a class type to the clipPaths and select by that class.
            // http://stackoverflow.com/questions/11742812/cannot-select-svg-foreignobject-element-in-d3
            // https://bugs.webkit.org/show_bug.cgi?id=83438

            var clipBind = svg
                .select ("defs")
                .selectAll (".napierClip")
                .data (depths)
            ;


            var sharedClipAttrs = function (group) {
                group
                    .attr ("x", function(d) { return d.x; })
                    .attr ("y", function(d) { return d.y; })
                    .attr ("width", function(d) { return d.width; })
                    .attr ("height", function(d) { return d.height; })
                ;
            };

            clipBind.exit().remove();

            clipBind
                .select ("rect")
                .call (sharedClipAttrs)
            ;

            clipBind.enter()
                .append ("clipPath")
                .attr ("class", "napierClip")
                .attr ("id", function(d) { return "depthclip"+d.depth; })
                .append ("rect")
                .call (sharedClipAttrs)
            ;
        }
    };

    var sunburstLayout = {

        cutoffVal: 0.1,

        sizeBounds: function () {
            var radius = d3.min(dims) / 2;
            VESPER.log ("DIMS", dims, radius);
            return [2 * Math.PI, radius * radius];
        },

        booleanSelectedAttrs: function (group) {
            group
                //.attr ("class", function(d) { var node = getNode (d.id) /*d*/; return "fatarc "+ (model.getSelectionModel().contains(d.id) ? "selected" : (node.sdcount > 0 ? "holdsSelected" : "unselected")); })
                .attr ("class", function(d) { return model.getSelectionModel().contains(d.id) ? "selected" : "unselected"; })
            ;
        },

        propSelectedAttrs: function (group) {
            group.attr ("class", "holdsSelected") ;
        },

        sharedTextAttrs: function (sel) {
            function rotate (d, elem) {
                return d.dx > d.dy && d3.select(elem).node().getComputedTextLength() < d.dx - 4;
            }

            sel
                .attr ("transform", function (d) {
                return "translate ("+ (d.x)+","+ d.y+")"
                   // + " rotate ("+(rotate(d, this) ? 90 : 0)+" "+(d.dy/2)+" 0)"
                    //: "rotate (0 0,0)"
                    ;
                })
                //.attr ("clip-path", function (d) { var node = getNode (d.id) /*d*/; return rotate(d, this) ? null : "url(#depthclip0)"; /*"url(#depthclip"+node.depth+")";*/})
            ;
        },

        arc: d3.svg.arc()
            .startAngle(function(d) { return d.x; })
            .endAngle(function(d) { return d.x + d.dx; })
            .innerRadius(function(d) { return Math.sqrt(d.y); })
            .outerRadius(function(d) { return Math.sqrt(d.y + d.dy); })
        ,

        parc: d3.svg.arc()
            .startAngle(function(d) { return d.x; })
            .endAngle(function(d) { return d.x + d.dx; })
            .innerRadius(function(d) {
                var oRad = Math.sqrt(d.y + d.dy);
                var diff = oRad - Math.sqrt (d.y);
                var node = getNode (d.id);
                var prop = 0;
                if (node.dcount > 0 && node.sdcount > 0) {
                    var prop = Math.log (node.sdcount + 1) / Math.log (node.dcount + 1);
                    prop *= prop; // square cos area of ring is square of radius
                }
                return oRad - (prop * diff);
            })
            .outerRadius(function(d) {
                return Math.sqrt(d.y + d.dy);
            })
        ,


        // Stash the old values for transition.
        cstash: function (d) {
            cstore[d.id] = {x0: d.x, dx0: d.dx, y0: d.y, dy0: d.dy};
        },
        pstash: function (d) {
            pstore[d.id] = {x0: d.x, dx0: d.dx, y0: d.y, dy0: d.dy};
        },

        // Interpolate the arcs in data space.
        arcTween: function (a) {
            //VESPER.log ("a", a, a.dx0);
            var cs = cstore [a.id];
            if (cs === undefined) {
                console.log ("No STORE", a.id, a);
            }
            if (cs) {
                var i = d3.interpolate({x: cs.x0, dx: cs.dx0, y: cs.y0, dy: cs.dy0}, a);
                return function(t) {
                    var b = i(t);
                    cs.x0 = b.x;
                    cs.dx0 = b.dx;
                    cs.y0 = b.y;
                    cs.dy0 = b.dy;
                    return sunburstLayout.arc(b);
                };
            }
        },

        parcTween: function (a) {
            //VESPER.log ("a", a, a.dx0);
            var ps = pstore [a.id];
            var i = d3.interpolate({x: ps.x0, dx: ps.dx0, y: ps.y0, dy: ps.dy0}, a);
            return function(t) {
                var b = i(t);
                ps.x0 = b.x;
                ps.dx0 = b.dx;
                ps.y0 = b.y;
                ps.dy0 = b.dy;
                return sunburstLayout.parc(b);
            };
        },

        prep: function (coordSet) {
            treeG.attr("transform", "translate(" + dims[0] / 2 + "," + dims[1] * .52 + ")");
           // partitionLayout.makeTextClips (coordSet);
        },

        removeOld: function (exitSel) {
            clearMouseController (exitSel);
            exitSel
                .transition()
                .delay(0)
                .duration(0)
                .each ("end", function() {
                    var id = d3.select(this).datum().id;
                    cstore[id] = undefined;
                    pstore[id] = undefined;
                })
            ;
            NapVisLib.d3fadeAndRemoveGroups ([exitSel], exitDur, 0);
        },

        makeNew: function (enterSel) {

            var newNodes = enterSel
                .append ("svg:g")
                .attr("class", "treeNode")
                .style("opacity", 0)
                 .call (mouseController)
            ;

            newNodes
                .append("path")
                //.attr("display", function(d) { var node = getNode (d.id); return node.depth ? null : "none"; }) // hide inner ring
                .attr("d", sunburstLayout.arc)
                .attr ("id", function(d) { return "arc"+ d.id; })
                .call (sunburstLayout.booleanSelectedAttrs)
                .each(sunburstLayout.cstash)
            ;

            newNodes
                .append("path")
                //.attr("display", function(d) { var node = getNode (d.id); return node.depth ? null : "none"; }) // hide inner ring
                .attr("d", sunburstLayout.parc)
                .attr ("id", function(d) { return "parc"+ d.id; })
                .style ("opacity", 0.75)
                .call (sunburstLayout.propSelectedAttrs)
                .each(sunburstLayout.pstash)
            ;

            return newNodes;
        },

        redrawExistingNodes: function (group, delay) {
           group
               .select("path:not(.holdsSelected)")
               .call (sunburstLayout.booleanSelectedAttrs)
                .transition()
                .delay (delay)
                .duration(updateDur)
                .attrTween("d", sunburstLayout.arcTween)
                .each ("end", sunburstLayout.cstash)
            ;

            group
                .select("path.holdsSelected")
                .call (sunburstLayout.propSelectedAttrs)
                .transition()
                .delay (delay)
                .duration(updateDur)
                .attrTween("d", sunburstLayout.parcTween)
                .each ("end", sunburstLayout.pstash)
            ;

            group.select("text")
                .style ("visibility", function (d) { return d.dx > 1 ? "visible": "collapse"; })
            ;
        }
    };

    var layoutOptions = {Icicle: partitionLayout, Sunburst: sunburstLayout};

    this.set = function (fields, mmodel) {
        ffields = mmodel.makeIndices ([fields.identifyingField, fields.rankField]);
        keyField = ffields[0];
        rankField = ffields[1];
        console.log ("FFIELDS", ffields);
        dims = NapVisLib.getWidthHeight (d3.select(divid).node());
        model = mmodel;
    };

	
	this.go = function () {
		thisView = this;
		
		svg = d3.select(divid)
			.append("svg:svg")
			.attr("class", "visContainer")
			.attr("pointer-events", "all")
		;
		
		svg.append ("defs");
		
		treeG = svg
			.append ("svg:g")
			.attr("class", "treeSVG")
		;

        var vals = model.getSelectionModel().values();
        var root = (vals.length == 1) ? getNode(vals[0]) : model.getRoot();
        if (root === undefined) {
            VESPER.log ("no root defined for tree");
            return;
        }

        absRoot = root;

        var spaceAllocs = d3.values(spaceAllocationOptions);
        for (var n = 0; n < spaceAllocs.length; n++) {
            var indAlloc = spaceAllocs[n];
            //indAlloc.size ([dims[1], dims[0]]);
            //indAlloc.size (partitionLayout.sizeBounds());
        }
        spaceAlloc = spaceAllocationOptions.bottomUpLog;
		curSort = sortOptions.Alpha;
        layout = layoutOptions.Sunburst;

		//depthCharge (root);
        setupControls ();

        //$('[title!=""]').qtip();
		
		this.update ();
	};



    function setupControls () {
        var noHashId = divid.substring (1);
        var cpanel = d3.select(divid)
            .append("span")
            .attr ("class", "visControl")
            .attr ("id", noHashId+"controls")
        ;

        var spaceDiv = cpanel.append("div").attr("class", "taxaControlsSpaceAlloc");
        spaceDiv.append("p").html("Space Allocation");
        var allocBinds = spaceDiv.selectAll("button.allocChoice")
            .data(d3.entries (spaceAllocationOptions), function(d) { return d.key; });
        var aHolders = allocBinds.enter()
            .append ("span")
            .attr ("class", "fieldGroup")
        ;
        aHolders.append("input")
            .attr ("class", "allocChoice")
            .attr ("type", "radio")
            .attr ("id", function(d) { return noHashId+ d.key; })
            .attr ("name", function(d) { return noHashId+"alloc"; })
            .property ("checked", function(d) { return spaceAlloc === d.value; })
            .on ("change", function(d) {
               // if (spaceAlloc !== d.value) {
                    spaceAlloc = d.value;
                    reroot (curRoot);
                    //thisView.update();
               // }
                return false;
            })
        ;
        aHolders.append("label")
            .attr ("for", function(d) { return noHashId+ d.key; })
            .html (function(d) { return d.key; })
        ;

        var layoutDiv = cpanel.append("div").attr("class", "taxaControlsLayout");
        layoutDiv.append("p").html("Layout Style");
        var layoutBinds = layoutDiv.selectAll("button.layoutChoice")
            .data(d3.entries (layoutOptions), function(d) { return d.key; });
        var lHolders = layoutBinds.enter()
            .append ("span")
            .attr ("class", "fieldGroup")
        ;
        lHolders.append ("input")
            .attr ("class", "layoutChoice")
            .attr ("type", "radio")
            .attr ("id", function(d) { return noHashId+ d.key; })
            .attr ("name", function(d) { return noHashId+"layout"; })
            .property ("checked", function(d) { return layout === d.value; })
            .on ("change", function(d) {
               // if (layout !== d.value) {
                    layout = d.value;
                    var nodeBind = treeG.selectAll(".treeNode");
					clearMouseController (nodeBind);
                    nodeBind.remove();
                    reroot (curRoot);
               // }
                return false;
            })
            .html (function(d) { return d.key; })
        ;
        lHolders.append ("label")
            .attr("for", function(d) { return noHashId+ d.key; })
            .html (function(d) { return d.key; })
        ;

        var sortDiv = cpanel.append("div").attr("class", "taxaControlsSort");
		sortDiv.append("p").html("Sort");
        var sortBinds = sortDiv.selectAll("button.sortChoice")
            .data(d3.entries (sortOptions), function(d) { return d.key; });
        var sHolders = sortBinds.enter()
            .append ("span")
            .attr ("class", "fieldGroup")
        ;
        sHolders.append ("input")
            .attr ("class", "sortChoice")
            .attr ("type", "radio")
            .attr ("id", function(d) { return noHashId+ d.key; })
            .attr ("name", function(d) { return noHashId+"sort"; })
            .property ("checked", function(d) { return curSort === d.value; })
            .on ("change", function(d) {
               // if (layout !== d.value) {
                    curSort = d.value;
                    reroot (curRoot);
               // }
                return false;
            })
            .html (function(d) { return d.key; })
        ;
        sHolders.append ("label")
            .attr("for", function(d) { return noHashId+ d.key; })
            .html (function(d) { return d.key; })
        ;

        $(function() {
            $("#"+noHashId+"controls").draggable();
        });
    }


	function getNode (id) {
        return model.getNodeFromID (id);
    }


    function reroot (root) {
        if (firstLayout) {
            if (VESPER.alerts) { alert ("about to calc layout"); }
            firstLayout = false;
        }

        spaceAlloc
            .size (layout.sizeBounds())
            .cutoff (layout.cutoffVal)
			.sort (curSort)
        ;
        VESPER.log ("what alloc reports ",spaceAlloc.size());
        VESPER.log ("root", root);
        var coordSet = spaceAlloc.nodes (root);
        VESPER.log (coordSet.length, coordSet);
        curRoot = root;

        var nodeBind = treeG
                .selectAll(".treeNode")
                .data(coordSet, function(d) { return d.id /*d[DWCAParser.TDATA][keyField]*/; })
            ;

        layout.prep (coordSet);

        // remove old nodes
        layout.removeOld (nodeBind.exit());
        var cumDelay = (nodeBind.exit().empty() ? 0 : exitDur);

        // process existing nodes
        layout.redrawExistingNodes (nodeBind, cumDelay);
        cumDelay += (nodeBind.empty()) ? 0 : updateDur;

        // add new nodes
        var newNodes = layout.makeNew (nodeBind.enter());
        VESPER.log (newNodes);
        NapVisLib.d3fadeInNewGroups ([newNodes], enterDur, cumDelay);
    }


	this.update = function () {
        var vals = model.getSelectionModel().values();
        var root = (vals.length == 1) ? getNode(vals[0]) : model.getRoot();
        VESPER.log ("Root", root, vals[0]);

        model.countSelectedDesc (model.getRoot(), keyField);
        root = firstBranch (model.getRoot());
        reroot (root);
	};

    this.updateVals = this.update;


    // calculate suitable root for vis
    // suitable root is first node who has more than one child either holding selected descendants or is selected
    function firstBranch (node) {
        var nid = model.getIndexedDataPoint (node, keyField);
        if (node.sdcount == undefined || node.sdcount == 0 || model.getSelectionModel().contains (nid)) {
            return node;
        }
        var children = model.getSubTaxa (node);
        if (children) {
            var splitCount = 0;
            var singleNode;
            for (var n = 0; n < children.length; n++) {
                var child = children[n];
                var cid = model.getIndexedDataPoint (child, keyField);
                if (model.getSelectionModel().contains (cid)) {
                    splitCount++;
                }
                else if (child.sdcount > 0) {
                    splitCount++;
                    singleNode = child;
                }
            }
            // is a split if more than one child is selected or has selected descendants, so make root here
            if (splitCount > 1) {
                return node;
            }

            // if just one child holds selected descendants (and isn't selected itself, guaranteed by else if above) then pursue that path recursively
            if (singleNode) {
                node = firstBranch (singleNode);
            }
            /*
            else {
                node = node; // otherwise return the current node (parent to single selected node)
            }
            */
        }
        return node;
    }


    this.redraw = function () {
        var nodes = treeG.selectAll(".treeNode");
        layout.redrawExistingNodes (nodes, 0);
    };


    this.destroy = function () {
        clearMouseController (treeG.selectAll(".treeNode"));
        treeG.selectAll(".treeNode").remove();
        model.removeView (self);
        // null model and roots, basically any var that points to the data. Help GC along.
        // Google chrome profiler says it does so ner
        model = null;
        absRoot = null;
        curRoot = null;
        DWCAHelper.twiceUpRemove(divid);
    };


    function clearMouseController (group) {
        group
            .on ("click", null)	// remove event handler
            .on ("mouseover", null)	// remove event handler
            .on ("mouseout", null)	// remove event handler
            .on ("contextmenu", null) // remove event handler
        ;
    }

	function mouseController (group) {
        group
        .on("click", function (d) {
            var node = getNode (d.id) /*d*/;
            reroot ((node == curRoot && node.parent != undefined) ? node.parent : node);
        })
        .on("mouseover", function(d) {
            d3.select(this).selectAll("*").classed("highlight", true);
            //handle mouse over
            var node = getNode (d.id) /*d*/;
            var val = tooltipString (node, model);
            VESPER.tooltip.updateText (model.getLabel(node), val);
            VESPER.tooltip.updatePosition (d3.event);
        })
        .on ("mouseout", function(d) {
            d3.select(this).selectAll("*").classed("highlight", false);
        })
        .on("contextmenu", function(d) {
            //handle right click
            selectSubTree (getNode (d.id));
            //stop showing browser menu
            d3.event.preventDefault();
        });

    }

    function selectSubTree (node) {
        model.getSelectionModel().clear();
        var ids = [];
        selectSubTreeR (node, ids);
        model.getSelectionModel().addAllToMap(ids);
    }

    function selectSubTreeR (node, ids) {
        //var id = model.getTaxaData(node)[keyField];
        var id = model.getIndexedDataPoint (node, keyField);
        ids.push(id);

        var taxa = model.getSubTaxa (node);
        if (taxa != undefined) {
            for (var n = 0; n < taxa.length; n++) {
                selectSubTreeR (taxa[n], ids);
            }
        }
        var specs = model.getSpecimens (node);
        if (specs != undefined) {
            for (var n = 0; n < specs.length; n++) {
                selectSubTreeR (specs[n], ids);
            }
        }
    }


	function reset() {
		d3.event.scale = 1.0;
		d3.event.translate = [0,0];
		zoomObj.translate([0,0]).scale(1);
		//redraw ();
	}
};