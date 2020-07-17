// This adds a sample() method to arrays, to randomly select a random element of the array.
Array.prototype.sample = function(){
    return this[Math.floor(Math.random()*this.length)];
}

/**
 * Object to hold all data needed for a question. You should not use this yourself, it's created by the Randomizer.
 * @class
 * @param question {QuestionData} The Qualtrics API object for the question
 * @param container {Element} The jQuery Element for the div containing this question
 * @param blockID {string} The ID of the block this question belongs to
 */
function QuestionInfo(question, container, blockID) {
    this.question = question;
    this.container = container;
    this.blockID = blockID;
}

/**
 * Object to manage question blocks. Blocks contain at least one question, and are the objects that are actually ordered.
 * Ordering on blocks allow for multiple questions to be displayed together at the same time.
 * @param identifier
 * @param group
 * @param use_buttons
 * @constructor
 */
function QuestionBlock(identifier, group, use_buttons) {
    this.identifier = identifier
    this.group = group;
    this.use_buttons = use_buttons;
    this.questions = [];
    this.filledInQuestions = [];

    /**
     *
     * @param question {QuestionInfo}
     */
    this.addQuestion = function (question) {
        this.questions.push(question)
        this.filledInQuestions.push(false);
    }

    /**
     * Returns the last question in this block.
     * Used mostly because we hijack the last question's container to add a button.
     * @return {QuestionInfo}
     */
    this.getLast = function () {
        return this.questions[this.questions.length - 1];
    }

    /**
     * Shows all questions in this block
     */
    this.show = function () {
        this.questions.forEach(el => el.container.show());

        let button = this.getButtonElement();
        // Hide the button if there exists one
        if(button)
            button.show();

        document.getElementById(this.questions[0].question.questionId).scrollIntoView();
    }

    /**
     * Hides all questions in this block
     */
    this.hide = function () {
        this.questions.forEach(el => el.container.hide());
        let button = this.getButtonElement();
        // Hide the button if there exists one
        if(button)
            button.hide();
    }

    this.onQuestionClick = function (question, randomizer, event, element) {
        if(!this._isQuestionFilled(question, event, element))
            return;

        let index = this.questions.indexOf(question);
        this.filledInQuestions[index] = true;

        if (this.canProgress())
        {
            if (this.use_buttons)
            {
                this.getButtonElement().find("input").prop('disabled', false);
            }
            else
            {
                randomizer.step();
            }
        }
    }

    this._isQuestionFilled = function(q, event, element)
    {
        if (element.type === 'radio')
        {
            return true;
        }
        else
        {
            return q.question.getTextValue() != "";
        }
    }

    this.canProgress = function () {
        return this.filledInQuestions.every(v => v);
    }

    this.getButtonElement = function () {
        let questionId = this.getLast().question.questionId;
        return jQuery("div[data-question-id=" + questionId + "]");
    }
}

/**
 * This is the main randomizer class.
 * @class
 * @param max_same_items {int} The max number of successive questions with the same group. Default: 2
 * @param use_buttons {boolean} If by default, the questions should get a 'next question' button. If false, the next
 * question will be loaded when a question is clicked. Can be overridden on a per-question basis. Default: true
 * @param randomize_algorithm {string} The algorithm to be used. (Only general is supported at this time). Default: general
 * @param debug {boolean} If true, it will log debug info to the console. Default: false
 */
function Randomizer(max_same_items = 2, use_buttons=true, randomize_algorithm='general', debug=false)
{
    // List used to contain the order to be used
    this.order = [];
    // Dict of all blocks
    this.blocks = {};
    // If by default, we should use buttons to advance to the next question
    this.use_buttons = use_buttons;
    // Index of the **previous** question.
    this.n = 0
    // The randomize algorithm to use
    this.algorithm = randomize_algorithm;
    // Max number of successive same-group questions
    this.max_same_items = max_same_items;
    // Should be self-explaining
    this.debug = debug
    // If the randomizer is locked, no questions can be added anymore
    this.locked = false;

    /**
     * This method is used to register a question. Should be called from Qualtrics.SurveyEngine.addOnload
     * @param q {QuestionData} Qualtrics API object. Just fill in 'this' (without the quotation marks).
     * @param group {string} The group this question belongs to. Can be anything, if used consistently.
     * @param block {string} Optional, the name of the block of questions. Can be used to group questions together.
     * @param use_buttons {undefined|boolean} (Optional) This can be used to force buttons/no buttons usage for this question. If
     * not provided, the default set for this randomizer will be used.
     */
    this.addQuestion = function (q, group, block = undefined, use_buttons=undefined) {
        // If the randomizer is locked, no questions can be added anymore
        if (this.locked)
            return;

        // Hide the Qualtrics button. We use our own.
        q.hideNextButton();

        // Get the jQuery element which holds this question. Luckily, Qualtrics uses the questionId as the HTML id value.
        let container = jQuery("#"+q.questionId);
        container.hide();

        // If undefined, use the default for this randomizer
        if(use_buttons === undefined)
            use_buttons = this.use_buttons

        // Get the block for this question
        let qBlock = this._getOrCreateBlock(block, group, use_buttons);

        // Create the info object and save it
        let info = new QuestionInfo(q, container, qBlock.identifier);
        qBlock.addQuestion(info);
    }

    /**
     * Tries to get an existing block if it exists. Creates a new block if needed.
     * @param block The block identifier
     * @param group The group that this block belongs to. Note: the first question in the block dictates the group
     * @return {QuestionBlock|*}
     * @private
     */
    this._getOrCreateBlock = function (block, group) {
        // If the user didn't supply a block name, generate a random one
        if (block === undefined)
            block = this._generateRandomBlockID();

        // If it already exists, return the existing one
        if (this.blocks[block] !== undefined)
            return this.blocks[block];

        // Otherwise, create one
        let qBlock = new QuestionBlock(block, group, use_buttons);
        this.blocks[block] = qBlock;

        return qBlock;
    }

    /**
     * Tries to make a unique identifier if none was supplied by the user
     * @return {string}
     * @private
     */
    this._generateRandomBlockID = function () {
        let id = Math.random().toString(36).substring(7);

        if(this.blocks[id] === undefined)
            return id;

        return this._generateRandomBlockID();
    }

    /**
     * Adds the necessary events/buttons for flow control to all blocks.
     */
    this.addFlowControls = function () {
        for(var key in this.blocks)
        {
            let block = this.blocks[key];
            this._addFlowControl(block, block.use_buttons);
        }
    }

    /**
     * This private method makes sure progressing between blocks is possible. There are two options:
     * - Using buttons, which will add a HTML button and register an event handler to said button. (Default behaviour)
     * - Using click, which will use Qualtrics 'questionclick' event to call randomizer.step().
     * Note: the click method only makes sense with a multiple choice question.
     * @param questionBlock {QuestionBlock} The info object for this question
     * @private
     */
    this._addFlowControl = function (questionBlock, use_buttons) {
        let randomizer = this;

        questionBlock.questions.forEach(q => {
            let question = q.question;
            question.questionclick = function (event, element) {
                questionBlock.onQuestionClick(q, randomizer, event, element);
            };
        })

        if (use_buttons) {
            let question = questionBlock.getLast();
            let buttonContainer = jQuery("<div class='Buttons' data-question-id='" + question.question.questionId + "'></div>");
            let button = jQuery("<input style=\"float:right;\" disabled=\"disabled\" title=\"→\" type=\"button\" name=\"NextButton\" value=\"→\">")

            button.click(function () {
                randomizer.step();
            });

            buttonContainer.append(button);
            question.container.parent().append(buttonContainer);
            buttonContainer.hide();
        }
    }

    /**
     * This method will call the selected randomize algorithm and randomize the blocks.
     * You really should just call randomizer.start(), which will also call this method.
     */
    this.randomize = function () {
        if(this.algorithm === 'general')
            this._randomize_general();
    }

    /**
     * The normal randomizer algorithm.
     * @param randomize_attempt {int} The number of times already attempted to create a random order.
     * @private
     */
    this._randomize_general = function (randomize_attempt = 0) {
        // Stop after 10 randomize attempts, it's probably hopeless.
        if(randomize_attempt > 10)
        {
            alert("Could not shuffle questions! This is most likely because there is no valid order to be made with the current max_same_items value!")
            return;
        }

        let blockKeys = Object.keys(this.blocks);
        let numItems = blockKeys.length;
        // Array to built the new order in.
        let order = [];
        let lastGroup = undefined;
        let numOfLastGroup = 0;
        // Number of attempts to find a fitting element. (NOT the amount of attempts to create a random order).
        let attempts = 0;

        while (blockKeys.length > 0) {
            // Re-try if we have more attempts to find a fitting question than twice all the questions.
            // In this case, the randomize algorithm has made previous choices which prohibit finishing.
            if (attempts === (numItems*2))
            {
                if(this.debug)
                    console.log("Starting new attempt!");
                this._randomize_general(randomize_attempt + 1);
                return;
            }

            // Pick a random item
            let key = blockKeys.sample();
            let el = this.blocks[key];

            if(this.debug)
                console.log("Picked block " + key + ", group " + el.group)

            // If this element belongs to a different group than last OR we haven't reached the limit of successive items
            if (el.group !== lastGroup || (el.group === lastGroup && numOfLastGroup < this.max_same_items))
            {
                // Add it to the order
                order.push(el);
                // Remove it from the original list
                blockKeys.splice(blockKeys.indexOf(key), 1);

                // If this group isn't the same as last, reset
                if(el.group !== lastGroup)
                {
                    numOfLastGroup = 1;
                }
                // Otherwise, increase the counter
                else
                {
                    numOfLastGroup += 1 ;
                }
                // Reset these variables to the proper value
                lastGroup = el.group;
                attempts = 0;
            }
            else
            {
                // This element doesn't fit. Count this as an attempt to find a fitting element
                attempts += 1;
                if(this.debug)
                    console.log('Rejecting item from group')
            }
        }

        this.order = order;
        if(this.debug)
            this._print_chosen_order()
    }

    /**
     * Not implemented. Might be used to implement the algorithm from ZEP if the general one isn't working right
     */
    this.randomize_zep = function () {
        // NOT IMPLEMENTED
    }

    /**
     * This method will randomize the order, add flow controls, and display the first question.
     * Read: use this to start the questions
     */
    this.start = function () {
        this.locked = true;
        this.addFlowControls();
        this.randomize();
        this.step();
    }

    /**
     * Debug method to log the final order to console
     * @private
     */
    this._print_chosen_order = function() {
        console.log("Chosen order:");
        this.order.forEach(el => console.log("BlockID: " + el.identifier + "; Group: " +el.group));
        console.log("End");
    }

    /**
     * This method will display the next block, and enable the Qualtrics next button if it's the last block.
     * @returns {undefined|QuestionInfo} The questionInfo object for the new question
     */
    this.step = function () {
        // Hide the last question, if there is any.
        if(this.n > 0)
        {
            this.order[this.n - 1].hide();
        }
        // Do nothing if our next index is one above the index of the last question, we're at the last question
        if(this.order.length > this.n) {
            // Get the new block and increment n
            let block = this.order[this.n]
            this.n += 1;

            // Show this block
            block.show();

            // Note, while this.n is an index, we can compare this with length as it's already incremented by 1
            if(this.order.length === this.n)
            {
                // If this is the last question, show Qualtrics' next button and hide our own button if present.
                block.getLast().question.showNextButton();
                if(block.use_buttons) {
                    block.getButtonElement().hide();
                }
            }

            return block
        }
        return undefined
    }
}