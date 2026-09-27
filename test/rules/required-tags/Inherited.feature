@ticket-1
Feature: Tags a scenario inherits

  @smoke
  Scenario: Inherits the ticket from the Feature
    Given something

  @ticket-2
  Rule: A rule with a ticket of its own

    @smoke
    Scenario: Inherits a ticket from the Rule as well
      Given something

  Rule: Examples tables carry tags too

    @smoke
    Scenario Outline: Every table carries the tag
      Given <thing>

      @release-1
      Examples:
        | thing |
        | a     |

      @release-2
      Examples:
        | thing |
        | b     |

    @smoke
    Scenario Outline: One table does not
      Given <thing>

      @release-1
      Examples:
        | thing |
        | a     |

      Examples:
        | thing |
        | b     |
