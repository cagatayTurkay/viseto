/**
 * Visualisation of topic models using evaluation metrics and model parameters.
 * Data input:
 * - array of metrics, each has:
 *  - name
 *  - label
 * - array of models, each has:
 *  - modelId
 *  - metric values
 */
pv.vis.topicModels = function () {
    /**
     * Visual configs.
     */
    const margin = { top: 25, right: 5, bottom: 5, left: 5 },
        radius = 16,
        axisOffsetX = 25,
        axisOffsetY = 15;

    let visWidth = 960, visHeight = 600, // Size of the visualization, including margins
        width, height, // Size of the main content, excluding margins
        visTitle = 'Scatter Metrics',
        modelTooltip = d => d.tooltip,
        modelParams = {
            'alpha': [0.01, 0.1, 1, 10],
            'beta': [0.01, 0.1, 1, 10],
            'num_topics': [5, 10, 15, 20]
        }, paramList = ['alpha', 'beta', 'num_topics'],
        numLevels = modelParams['alpha'].length,
        numParams = paramList.length,
        axisMappings = ['dim 1', 'dim 2', 'mean rank', 'best rank'],
        xAxisMappingIdx = 2,
        yAxisMappingIdx = 3,
        showGlyphs = true,
        fixBy = 2, // 1,2,3
        brushing = false;

    /**
     * Accessors.
     */
    let modelId = d => d.modelId,
        groupId = d => d.condition.map(c => c.join('-')).join(','),
        meanRank = d => d.mean_rank,
        bestRank = d => d.best_rank,
        mappingAccessors = [
            d => d.coords[0],
            d => d.coords[1],
            meanRank,
            bestRank
        ];

    /**
     * Data binding to DOM elements.
     */
    let modelData,
        groupData,
        dataChanged = true; // True to redo all data-related computations

    /**
     * DOM.
     */
    let visContainer, // Containing the entire visualization
        modelContainer,
        groupContainer,
        brushContainer,
        xAxisContainer,
        yAxisContainer,
        xAxisLabel,
        yAxisLabel;

    /**
     * D3.
     */
    const xScale = d3.scaleLinear(),
        yScale = d3.scaleLinear(),
        xAxis = d3.axisBottom(xScale),
        yAxis = d3.axisLeft(yScale),
        brush = d3.brush().on('brush', onBrushed).on('end', onBrushended),
        listeners = d3.dispatch('click', 'hover', 'brush');

    /**
     * Main entry of the module.
     */
    function module(selection) {
        selection.each(function (_data) {
            // Initialize
            if (!this.visInitialized) {
                const container = d3.select(this).append('g').attr('class', 'pv-topic-models');
                visContainer = container.append('g').attr('class', 'main-vis');
                brushContainer = visContainer.append('g').attr('class', 'brush');
                modelContainer = visContainer.append('g').attr('class', 'models');
                groupContainer = visContainer.append('g').attr('class', 'groups');

                modelData = _data.models;
                groupData = _data.groups;

                addAxes();
                addSettings(container);

                this.visInitialized = true;
            }

            update();
        });

        dataChanged = false;
    }

    /**
     * Updates the visualization when data or display attributes changes.
     */
    function update() {
        // Canvas update
        width = visWidth - margin.left - margin.right;
        height = visHeight - margin.top - margin.bottom;
        xScale.range([axisOffsetX, width - axisOffsetX]);
        yScale.range([height - axisOffsetY, 5]);

        visContainer.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
        xAxisContainer.attr('transform', 'translate(0,' + (height - axisOffsetY) + ')');
        yAxisContainer.attr('transform', 'translate(' + axisOffsetX + ',0)');

        /**
         * Computation.
         */
        // Updates that depend only on data change
        let data;
        if (dataChanged) {
            data = fixBy === 3 ? modelData : groupData.filter(g => g.condition.length == fixBy);
            xScale.domain(d3.extent(data, mappingAccessors[xAxisMappingIdx]).reverse()).nice();
            yScale.domain(d3.extent(data, mappingAccessors[yAxisMappingIdx]).reverse()).nice();

            modelContainer.selectAll('.model').remove();
            groupContainer.selectAll('.group').remove();
        }

        xAxisContainer.call(xAxis);
        yAxisContainer.call(yAxis);
        xAxisLabel.attr('transform', 'translate(' + width + ',-3)');
        yAxisLabel.attr('transform', 'translate(0,-3) rotate(-90)');

        brush.extent([[0, 0], [width, height]]);
        brushContainer.call(brush);

        // Updates that depend on both data and display change
        layoutModels();

        modelContainer.classed('hidden', fixBy !== 3);
        groupContainer.classed('hidden', fixBy === 3);

        if (fixBy === 3) {
            pv.enterUpdate(data, modelContainer, enterModels, updateModels, modelId, 'model');
        } else {
            pv.enterUpdate(data, groupContainer, enterGroups, updateGroups, groupId, 'group');
        }
    }

    function enterModels(selection) {
        const container = selection
            .attr('transform', d => 'translate(' + d.x + ',' + d.y + ')')
            .attr('opacity', 1);

        if (showGlyphs) {
            // Pie, one for each param
            const levelRadius = radius / numLevels,
                paramAngle = Math.PI * 2 / numParams;
            container.each(function (d) {
                _.times(numParams, i => {
                    const p = paramList[i],
                        paramValueIdx = modelParams[p].indexOf(d[p]);

                    const arc = d3.arc()
                        .innerRadius(0)
                        .outerRadius((paramValueIdx + 1) * levelRadius)
                        .startAngle(paramAngle * i)
                        .endAngle(paramAngle * (i + 1));
                    d3.select(this).append('path')
                        .attr('d', arc);
                });
            });
        } else {
            container.append('circle').attr('r', 4);
        }

        container.append('title')
            .text(modelTooltip);

        container.on('mouseover', function (d) {
            if (brushing) return;

            modelContainer.selectAll('.model').classed('hovered', d2 => d2 === d);
            modelContainer.selectAll('.model').filter(d2 => d2 === d).raise();
            listeners.call('hover', module, modelId(d));
        }).on('mouseout', function () {
            modelContainer.selectAll('.model').classed('hovered', false);
            listeners.call('hover', module, null);
        }).on('click', function (d) {
            listeners.call('click', module, modelId(d));
        });
    }

    function updateModels(selection) {
        selection.each(function (d) {
            const container = d3.select(this);

            container.transition()
                .attr('transform', 'translate(' + d.x + ',' + d.y + ')')
                .attr('opacity', 1);
        });
    }

    function enterGroups(selection) {
        const container = selection
            .attr('transform', d => 'translate(' + d.x + ',' + d.y + ')')
            .attr('opacity', 1);

        if (showGlyphs) {
            // Pie, one for each param
            const levelRadius = radius / numLevels,
                paramAngle = Math.PI * 2 / numParams;
            container.each(function (d) {
                _.times(numParams, i => {

                    let p = paramList[i],
                        paramValueIdx = -1;

                    d.condition.forEach(c => {
                        if (c[0] === p) {
                            paramValueIdx = modelParams[p].indexOf(c[1]);
                        }
                    });

                    const emptyFill = paramValueIdx === -1;

                    // If the param is missing, show as the biggest but with empty fill.
                    if (paramValueIdx === -1) paramValueIdx = modelParams[p].length - 1;

                    const arc = d3.arc()
                        .innerRadius(0)
                        .outerRadius((paramValueIdx + 1) * levelRadius)
                        .startAngle(paramAngle * i)
                        .endAngle(paramAngle * (i + 1));
                    d3.select(this).append('path')
                        .classed('no-fill', emptyFill)
                        .attr('d', arc);
                });
            });
        } else {
            container.append('circle').attr('r', 4);
        }

        container.append('title')
            .text(d => {
                let s = '';
                if (d.condition.length === 1) {
                    s += '16 models with ' + d.condition[0][0] + '=' + d.condition[0][1];
                } else {
                    s += '4 models with ' + d.condition[0][0] + '=' + d.condition[0][1] + ', ' + d.condition[1][0] + '=' + d.condition[1][1];
                }

                s += '\n  Average mean rank: ' + meanRank(d).toFixed(1) +
                    '\n  Average best rank: ' + bestRank(d).toFixed(1);

                return s;
            });

        container.on('mouseover', function (d) {
            if (brushing) return;

            listeners.call('hover', module, modelId(d));
        }).on('mouseout', function () {
            listeners.call('hover', module, null);
        }).on('click', function (d) {
        });
    }

    function updateGroups(selection) {
        selection.each(function (d) {
            const container = d3.select(this);

            container.transition()
                .attr('transform', 'translate(' + d.x + ',' + d.y + ')')
                .attr('opacity', 1);
        });
    }

    function layoutModels() {
        modelData.forEach(d => {
            d.x = xScale(mappingAccessors[xAxisMappingIdx](d));
            d.y = yScale(mappingAccessors[yAxisMappingIdx](d));
        });

        groupData.forEach(g => {
            g.x = xScale(mappingAccessors[xAxisMappingIdx](g));
            g.y = yScale(mappingAccessors[yAxisMappingIdx](g));
        })
    }

    function onBrushed() {
        brushing = true;

        const s = d3.event.selection;
        if (!s) {
            // Empty selection, turn back to no brushing mode
            modelContainer.selectAll('.model').each(function () {
                d3.select(this).classed('non-brushed', false);
                d3.select(this).classed('brushed', false);
            });

            // Broadcast
            listeners.call('brush', module, null);
        } else {
            const isBrushed = d => d.x >= s[0][0] && d.x <= s[1][0] && d.y >= s[0][1] && d.y <= s[1][1],
                brushedIds = modelData.filter(isBrushed).map(modelId);

            modelContainer.selectAll('.model').each(function (d) {
                d3.select(this).classed('non-brushed', !brushedIds.includes(modelId(d)));
                d3.select(this).classed('brushed', brushedIds.includes(modelId(d)));
            });

            // Broadcast
            listeners.call('brush', module, brushedIds);
        }
    }

    function onBrushended() {
        onBrushed.call(this);

        brushing = false;
    }

    function addAxes() {
        xAxisContainer = visContainer.append('g').attr('class', 'axis x');
        xAxisLabel = xAxisContainer.append('text').attr('class', 'label-button x')
            .text(axisMappings[xAxisMappingIdx])
            .on('click', function () {
                xAxisMappingIdx = (xAxisMappingIdx + 1) % axisMappings.length;
                d3.select(this).text(axisMappings[xAxisMappingIdx]);
                dataChanged = true;
                update();
            });

        yAxisContainer = visContainer.append('g').attr('class', 'axis y');
        yAxisLabel = yAxisContainer.append('text').attr('class', 'label-button y')
            .text(axisMappings[yAxisMappingIdx])
            .on('click', function () {
                yAxisMappingIdx = (yAxisMappingIdx + 1) % axisMappings.length;
                d3.select(this).text(axisMappings[yAxisMappingIdx]);
                dataChanged = true;
                update();
            });
    }

    function addSettings(container) {
        container = container.append('foreignObject').attr('class', 'settings')
            .attr('width', '100%').attr('height', '20px')
            .append('xhtml:div').attr('class', 'vis-header');

        container.html(`
            <div class='title'>${visTitle}</div>
            <div class='setting grouping'>
                Group
                <select>
                    <option value=3>None</option>
                    <option value=1>Fix 1 param</option>
                    <option value=2>Fix 2 params</option>
                </select>
            </div>
            <label class='setting'>Glyphs <input type='checkbox' class='glyph'></label>
            `
        );

        container.selectAll('.grouping select option').each(function (o) {
            this.selected = +this.value === fixBy;
        });
        container.select('.grouping select')
            .on('change', function () {
                fixBy = +this.value;
                dataChanged = true;
                update();
            });

        container.select('.setting .glyph').node().checked = showGlyphs;
        container.select('.setting .glyph').on('change', function () {
            showGlyphs = this.checked;
            dataChanged = true;
            update();
        });
    }

    /**
     * Sets/gets the width of the visualization.
     */
    module.width = function (value) {
        if (!arguments.length) return visWidth;
        visWidth = value;
        return this;
    };

    /**
     * Sets/gets the height of the visualization.
     */
    module.height = function (value) {
        if (!arguments.length) return visHeight;
        visHeight = value;
        return this;
    };

    /**
     * Sets the flag indicating data input has been changed.
     */
    module.invalidate = function () {
        dataChanged = true;
    };

    /**
     * Handles items that are brushed externally.
     */
    module.handleBrush = function (ids) {
        modelContainer.selectAll('.model')
            .classed('ext-brushed', !ids ? false : d => ids.length && ids.includes(modelId(d)))
            .classed('non-ext-brushed', d => !ids ? false : ids.length && !ids.includes(modelId(d)));
    };

    /**
     * Handle an item that is hovered externally.
     */
    module.handleHover = function (id) {
        modelContainer.selectAll('.model')
            .classed('hovered', d => modelId(d) === id)
            .filter(d => modelId(d) === id).raise();
    };

    /**
     * Binds custom events.
     */
    module.on = function () {
        const value = listeners.on.apply(listeners, arguments);
        return value === listeners ? module : value;
    };

    return module;
};